"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { shiftDate } from "@/lib/date";
import { awardMilestone } from "@/lib/milestone";

async function requireMember() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * 通过一条待确认的打卡。
 * 小圈子是"互相监督"：任何成员都能确认别人的，但不能确认自己的。
 * 确认之后才发分、才算连续天数。
 */
export async function approveCheckinAction(formData: FormData) {
  const ctx = await requireMember();
  const id = String(formData.get("checkinId") ?? "");

  const c = await prisma.checkin.findFirst({
    where: { id, habit: { circleId: ctx.circle.id } },
    include: { habit: true, user: { select: { nickname: true } } },
  });
  if (!c || c.status !== "PENDING") redirect("/review");
  if (c.userId === ctx.user.id) {
    redirect("/review?error=" + encodeURIComponent("不能确认自己的打卡"));
  }

  let awarded = 0;

  await prisma.$transaction(async (tx) => {
    let points =
      c.habit.type === "QUANTITY" ? c.habit.pointsPerUnit : c.habit.pointsPerCheckin;
    if (c.habit.type === "TIMED") points = 0;

    if (points > 0 && c.habit.dailyCap != null) {
      const sum = await tx.checkin.aggregate({
        where: {
          habitId: c.habitId,
          userId: c.userId,
          localDate: c.localDate,
          status: "APPROVED",
        },
        _sum: { pointsAwarded: true },
      });
      const used = sum._sum.pointsAwarded ?? 0;
      points = Math.max(0, Math.min(points, c.habit.dailyCap - used));
    }

    awarded = points;

    await tx.checkin.update({
      where: { id: c.id },
      data: {
        status: "APPROVED",
        pointsAwarded: points,
        reviewedBy: ctx.user.id,
        reviewedAt: new Date(),
      },
    });

    if (points > 0) {
      const w = await tx.wallet.upsert({
        where: { circleId_userId: { circleId: ctx.circle.id, userId: c.userId } },
        create: {
          circleId: ctx.circle.id,
          userId: c.userId,
          balance: points,
          totalEarned: points,
        },
        update: { balance: { increment: points }, totalEarned: { increment: points } },
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
          reason: `${c.habit.title}（${ctx.user.nickname}确认）`,
        },
      });
    }

    const stat = await tx.habitStat.findUnique({
      where: { habitId_userId: { habitId: c.habitId, userId: c.userId } },
    });
    const yesterday = shiftDate(c.localDate, -1);
    let current = 1;
    if (stat?.lastDoneDate === c.localDate) current = stat.currentStreak;
    else if (stat?.lastDoneDate === yesterday) current = stat.currentStreak + 1;
    const best = Math.max(stat?.bestStreak ?? 0, current);

    await tx.habitStat.upsert({
      where: { habitId_userId: { habitId: c.habitId, userId: c.userId } },
      create: {
        habitId: c.habitId,
        userId: c.userId,
        currentStreak: current,
        bestStreak: best,
        lastDoneDate: c.localDate,
        totalDone: 1,
      },
      update: {
        currentStreak: current,
        bestStreak: best,
        lastDoneDate: c.localDate,
        totalDone: { increment: 1 },
      },
    });

    await awardMilestone(tx, {
      circleId: ctx.circle.id,
      userId: c.userId,
      habitId: c.habitId,
      habitTitle: c.habit.title,
      streakDays: current,
      settings: ctx.circle.settings,
    });

    await tx.notification.create({
      data: {
        userId: c.userId,
        type: "CHECKIN_REVIEW",
        title: "打卡已确认",
        body: `${c.habit.title} · ${ctx.user.nickname} 点了确认`,
        link: "/",
      },
    });
  });

  revalidatePath("/review");
  revalidatePath("/");
  revalidatePath("/habits");
  redirect("/review?ok=" + encodeURIComponent(`已确认，${c.user.nickname} 拿到 ${awarded} 分（不进你的账）`));
}

/** 驳回：不发分，写理由 + 通知对方 */
export async function rejectCheckinAction(formData: FormData) {
  const ctx = await requireMember();
  const id = String(formData.get("checkinId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 100) || "看起来还没做完";

  const c = await prisma.checkin.findFirst({
    where: { id, habit: { circleId: ctx.circle.id } },
    include: { habit: true, user: { select: { nickname: true } } },
  });
  if (!c || c.status !== "PENDING") redirect("/review");

  await prisma.$transaction(async (tx) => {
    await tx.checkin.update({
      where: { id: c.id },
      data: {
        status: "REJECTED",
        pointsAwarded: 0,
        reviewedBy: ctx.user.id,
        reviewedAt: new Date(),
        rejectReason: reason,
      },
    });
    await tx.notification.create({
      data: {
        userId: c.userId,
        type: "CHECKIN_REVIEW",
        title: "打卡被驳回",
        body: `${c.habit.title}：${reason}`,
        link: "/",
      },
    });
  });

  revalidatePath("/review");
  revalidatePath("/");
  redirect("/review?ok=" + encodeURIComponent("已驳回"));
}

/** 催办：给对方发一条提醒（12 小时内不重复） */
export async function nudgeAction(formData: FormData) {
  const ctx = await requireMember();
  const targetId = String(formData.get("userId") ?? "");
  const title = String(formData.get("title") ?? "今天还没打卡").slice(0, 40);

  const member = await prisma.circleMember.findFirst({
    where: { circleId: ctx.circle.id, userId: targetId, status: "ACTIVE" },
  });
  if (!member) redirect("/review");

  const since = new Date(Date.now() - 12 * 3600_000);
  const recent = await prisma.notification.findFirst({
    where: { userId: targetId, type: "NUDGE", createdAt: { gte: since } },
  });
  if (!recent) {
    await prisma.notification.create({
      data: {
        userId: targetId,
        type: "NUDGE",
        title: "被催了一下",
        body: `${ctx.user.nickname}：${title}`,
        link: "/",
      },
    });
  }

  revalidatePath("/review");
  redirect("/review?ok=" + encodeURIComponent(recent ? "今天已经催过了" : "已催办"));
}

export async function readAllNotificationsAction() {
  const ctx = await requireMember();

  await prisma.notification.updateMany({
    where: { userId: ctx.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notifications");
  redirect("/notifications");
}
