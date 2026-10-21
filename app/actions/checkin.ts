"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { localDateString, shiftDate } from "@/lib/date";
import { requireUserId } from "@/lib/queries";
import { awardMilestone } from "@/lib/milestone";
import { awardTeamIfComplete } from "@/lib/team";

/**
 * 打卡。
 * - 普通/负向/计时型：一天一条
 * - 计量型：每点一次追加一条（最多 countPerDay 条）
 * 积分与流水在同一个事务里写，余额用增量更新，不做"先读后写"。
 */
export async function checkInAction(formData: FormData) {
  const userId = await requireUserId();
  const habitId = String(formData.get("habitId") ?? "");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const habit = await prisma.habit.findUnique({ where: { id: habitId } });
  if (!habit) return;

  const member = await prisma.circleMember.findFirst({
    where: { circleId: habit.circleId, userId, status: "ACTIVE" },
  });
  if (!member) return;
  if (habit.ownerId !== userId && !habit.collaborative) return;

  const today = localDateString(user.timezone, user.dayStartHour);
  const yesterday = shiftDate(today, -1);

  const existing = await prisma.checkin.findFirst({
    where: { habitId, userId, localDate: today },
    orderBy: { seq: "desc" },
  });

  if (existing && habit.type !== "QUANTITY") return; // 幂等：已完成就不再记
  if (existing && habit.type === "QUANTITY" && existing.seq >= habit.countPerDay) return;

  // 一起打卡：先记上，等另一半也打了，才一次性给两个人发分
  if (habit.collaborative) {
    await prisma.$transaction(async (tx) => {
      await tx.checkin.create({
        data: {
          habitId,
          userId,
          localDate: today,
          seq: (existing?.seq ?? 0) + 1,
          quantity: 1,
          status: "APPROVED",
          source: "MANUAL",
          pointsAwarded: 0,
        },
      });
      await awardTeamIfComplete(tx, { habit, date: today, circleId: habit.circleId });
    });

    revalidatePath("/");
    revalidatePath("/habits");
    return;
  }

  // 监督打卡：需要对方确认的，先记 PENDING，不发分、不动连续天数
  const pending = habit.needsReview;

  // 积分
  let points =
    habit.type === "QUANTITY" ? habit.pointsPerUnit : habit.pointsPerCheckin;
  if (habit.type === "TIMED") points = 0; // 计时的分由计时器发
  if (pending) points = 0;

  if (habit.dailyCap != null && points > 0) {
    const todaySum = await prisma.checkin.aggregate({
      where: { habitId, userId, localDate: today },
      _sum: { pointsAwarded: true },
    });
    const used = todaySum._sum.pointsAwarded ?? 0;
    points = Math.max(0, Math.min(points, habit.dailyCap - used));
  }

  await prisma.$transaction(async (tx) => {
    const checkin = await tx.checkin.create({
      data: {
        habitId,
        userId,
        localDate: today,
        seq: (existing?.seq ?? 0) + 1,
        quantity: 1,
        status: pending ? "PENDING" : "APPROVED",
        source: "MANUAL",
        pointsAwarded: points,
      },
    });

    if (points > 0) {
      const wallet = await tx.wallet.upsert({
        where: { circleId_userId: { circleId: habit.circleId, userId } },
        create: {
          circleId: habit.circleId,
          userId,
          balance: points,
          totalEarned: points,
        },
        update: {
          balance: { increment: points },
          totalEarned: { increment: points },
        },
      });

      await tx.pointTxn.create({
        data: {
          walletId: wallet.id,
          type: "EARN_CHECKIN",
          delta: points,
          balanceBefore: wallet.balance - points,
          balanceAfter: wallet.balance,
          refType: "checkin",
          refId: checkin.id,
          reason: habit.title,
        },
      });
    }

    // 连续天数（待确认的不算）
    if (!pending) {
      const stat = await tx.habitStat.findUnique({
        where: { habitId_userId: { habitId, userId } },
      });

      let current = 1;
      if (stat?.lastDoneDate === today) current = stat.currentStreak;
      else if (stat?.lastDoneDate === yesterday) current = stat.currentStreak + 1;

      const best = Math.max(stat?.bestStreak ?? 0, current);

      await tx.habitStat.upsert({
        where: { habitId_userId: { habitId, userId } },
        create: {
          habitId,
          userId,
          currentStreak: current,
          bestStreak: best,
          lastDoneDate: today,
          totalDone: 1,
        },
        update: {
          currentStreak: current,
          bestStreak: best,
          lastDoneDate: today,
          totalDone: { increment: 1 },
        },
      });

      // 连续里程碑奖励（同一档只发一次）
      const circle = await tx.circle.findUnique({
        where: { id: habit.circleId },
        select: { settings: true },
      });
      await awardMilestone(tx, {
        circleId: habit.circleId,
        userId,
        habitId,
        habitTitle: habit.title,
        streakDays: current,
        settings: circle?.settings,
      });
    }
  });

  revalidatePath("/");
  revalidatePath("/habits");
}

/** 撤销今天这次打卡：删记录 + 写反向流水 + 重算连续天数 */
export async function undoCheckinAction(formData: FormData) {
  const userId = await requireUserId();
  const habitId = String(formData.get("habitId") ?? "");

  const [user, habit] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.habit.findUnique({ where: { id: habitId } }),
  ]);
  if (!user || !habit) return;
  if (habit.ownerId !== userId && !habit.collaborative) return;

  const today = localDateString(user.timezone, user.dayStartHour);
  const last = await prisma.checkin.findFirst({
    where: { habitId, userId, localDate: today },
    orderBy: { seq: "desc" },
  });
  if (!last) return;

  await prisma.$transaction(async (tx) => {
    await tx.checkin.delete({ where: { id: last.id } });

    // 一起打卡：撤掉一个人的，另一边的奖励也要回滚（这一天又不算成功了）
    const affected = new Set<string>([userId]);
    if (habit.collaborative) {
      const others = await tx.checkin.findMany({
        where: { habitId, localDate: today, pointsAwarded: { gt: 0 } },
      });
      for (const o of others) {
        const w = await tx.wallet.update({
          where: { circleId_userId: { circleId: habit.circleId, userId: o.userId } },
          data: { balance: { decrement: o.pointsAwarded }, totalEarned: { decrement: o.pointsAwarded } },
        });
        await tx.pointTxn.create({
          data: {
            walletId: w.id,
            type: "ADJUST",
            delta: -o.pointsAwarded,
            balanceBefore: w.balance + o.pointsAwarded,
            balanceAfter: w.balance,
            refType: "checkin",
            refId: o.id,
            reason: `一起打卡被撤销：${habit.title}`,
          },
        });
        await tx.checkin.update({ where: { id: o.id }, data: { pointsAwarded: 0 } });
        affected.add(o.userId);
      }
    }

    if (last.pointsAwarded > 0) {
      const w = await tx.wallet.update({
        where: { circleId_userId: { circleId: habit.circleId, userId } },
        data: {
          balance: { decrement: last.pointsAwarded },
          totalEarned: { decrement: last.pointsAwarded },
        },
      });
      await tx.pointTxn.create({
        data: {
          walletId: w.id,
          type: "ADJUST",
          delta: -last.pointsAwarded,
          balanceBefore: w.balance + last.pointsAwarded,
          balanceAfter: w.balance,
          refType: "checkin",
          refId: last.id,
          reason: `撤销打卡：${habit.title}`,
        },
      });
    }

    // 连续天数重算（直接按已有记录数，不猜）
    for (const uid of affected) {
      const rows = await tx.checkin.findMany({
        where: { habitId, userId: uid },
        select: { localDate: true },
        distinct: ["localDate"],
        orderBy: { localDate: "desc" },
        take: 500,
      });
      const set = new Set(rows.map((r) => r.localDate));
      let cursor = set.has(today) ? today : shiftDate(today, -1);
      let streak = 0;
      while (set.has(cursor)) {
        streak++;
        cursor = shiftDate(cursor, -1);
      }
      const prev = await tx.habitStat.findUnique({
        where: { habitId_userId: { habitId, userId: uid } },
      });
      const best = Math.max(streak, prev?.bestStreak ?? 0);

      await tx.habitStat.upsert({
        where: { habitId_userId: { habitId, userId: uid } },
        create: {
          habitId,
          userId: uid,
          currentStreak: streak,
          bestStreak: best,
          lastDoneDate: rows[0]?.localDate ?? null,
          totalDone: rows.length,
        },
        update: {
          currentStreak: streak,
          bestStreak: best,
          lastDoneDate: rows[0]?.localDate ?? null,
          totalDone: rows.length,
        },
      });
    }
  });

  revalidatePath("/");
  revalidatePath("/habits");
}

/** 补打卡：只补最近 N 天，按系数给分（默认 0），不参与连续天数 */
export async function backfillAction(formData: FormData) {
  const userId = await requireUserId();
  const habitId = String(formData.get("habitId") ?? "");
  const date = String(formData.get("date") ?? "");
  const note = String(formData.get("note") ?? "").trim() || "补记";

  const [user, habit, circle] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.habit.findUnique({ where: { id: habitId } }),
    prisma.circle.findFirst({ where: { members: { some: { userId, status: "ACTIVE" } } } }),
  ]);
  if (!user || !habit || !circle) return;
  if (habit.ownerId !== userId && !habit.collaborative) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  const settings = (circle.settings ?? {}) as { allowBackfillDays?: number };
  const windowDays = Math.max(habit.allowBackfillDays ?? 0, settings.allowBackfillDays ?? 7);
  const today = localDateString(user.timezone, user.dayStartHour);
  const oldest = shiftDate(today, -windowDays);
  if (date >= today || date < oldest) {
    revalidatePath("/backfill");
    return;
  }

  const exists = await prisma.checkin.findFirst({ where: { habitId, userId, localDate: date } });
  if (exists) return;

  const base = habit.type === "QUANTITY" ? habit.pointsPerUnit : habit.pointsPerCheckin;
  const points = Math.max(0, Math.round(base * (habit.backfillPointsRatio ?? 0)));

  await prisma.$transaction(async (tx) => {
    const c = await tx.checkin.create({
      data: {
        habitId,
        userId,
        localDate: date,
        quantity: 1,
        status: "APPROVED",
        source: "BACKFILL",
        note,
        pointsAwarded: points,
      },
    });
    if (points > 0) {
      const w = await tx.wallet.update({
        where: { circleId_userId: { circleId: habit.circleId, userId } },
        data: { balance: { increment: points }, totalEarned: { increment: points } },
      });
      await tx.pointTxn.create({
        data: {
          walletId: w.id,
          type: "EARN_CHECKIN",
          delta: points,
          balanceBefore: w.balance - points,
          balanceAfter: w.balance,
          refType: "checkin",
          refId: c.id,
          reason: `${habit.title}（补记 ${date}）`,
        },
      });
    }
  });

  revalidatePath("/backfill");
  revalidatePath("/");
  revalidatePath("/habits");
}

/** 空状态一键铺示例习惯（只对"一个习惯都没有"的圈子生效） */
export async function seedDemoAction() {
  const userId = await requireUserId();

  const member = await prisma.circleMember.findFirst({
    where: { userId, status: "ACTIVE" },
  });
  if (!member) return;

  const count = await prisma.habit.count({
    where: { circleId: member.circleId, ownerId: userId },
  });
  if (count > 0) return;

  const demo = [
    { title: "早起", icon: "🌅", pointsPerCheckin: 10, sortOrder: 1 },
    { title: "阅读 30 分钟", icon: "📖", pointsPerCheckin: 15, sortOrder: 2 },
    { title: "喝水", icon: "💧", type: "QUANTITY" as const, unit: "杯", pointsPerUnit: 5, countPerDay: 3, sortOrder: 3 },
    { title: "练琴 45 分钟", icon: "🎸", type: "TIMED" as const, sortOrder: 4 },
    { title: "不喝奶茶", icon: "🚫", type: "NEGATIVE" as const, pointsPerCheckin: 8, sortOrder: 5 },
  ];

  for (const h of demo) {
    await prisma.habit.create({
      data: {
        circleId: member.circleId,
        ownerId: userId,
        frequency: { kind: "daily" },
        ...h,
      },
    });
  }

  // 顺手给三个技能卡片
  const skills = [
    { name: "吉他", icon: "🎸", color: "#6366f1" },
    { name: "阅读", icon: "📖", color: "#10b981" },
    { name: "运动", icon: "🏃", color: "#f59e0b" },
  ];
  const existingSkills = await prisma.skill.count({ where: { circleId: member.circleId } });
  if (existingSkills === 0) {
    for (const s of skills) {
      await prisma.skill.create({
        data: { ...s, circleId: member.circleId, ownerId: userId },
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/habits");
}
