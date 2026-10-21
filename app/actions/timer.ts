"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { elapsedSecondsOf, pointsFor, resolveCreditRule } from "@/lib/credit";
import { localDateString } from "@/lib/date";

async function ctxOrThrow() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** 开始一段计时。同一用户同时只能有一个进行中的会话。 */
export async function startTimer(input: {
  mode: "STOPWATCH" | "COUNTDOWN" | "POMODORO";
  plannedMinutes: number;
  phase?: "FOCUS" | "BREAK" | "LONG_BREAK";
  round?: number;
  skillId?: string | null;
  habitId?: string | null;
  note?: string;
}) {
  const ctx = await ctxOrThrow();

  const running = await prisma.timerSession.findFirst({
    where: { userId: ctx.user.id, status: { in: ["RUNNING", "PAUSED"] } },
    orderBy: { startedAt: "desc" },
  });
  if (running) return { ok: false, error: "已经有一个进行中的计时了" };

  const phase = input.phase ?? "FOCUS";
  const isBreak = input.mode === "POMODORO" && phase !== "FOCUS";

  const session = await prisma.timerSession.create({
    data: {
      userId: ctx.user.id,
      circleId: ctx.circle.id,
      mode: input.mode,
      phase,
      round: Math.max(1, input.round ?? 1),
      status: "RUNNING",
      plannedSeconds:
        input.mode === "STOPWATCH" ? null : Math.max(1, input.plannedMinutes) * 60,
      startedAt: new Date(),
      lastHeartbeatAt: new Date(),
      skillId: isBreak ? null : input.skillId || null,
      habitId: isBreak ? null : input.habitId || null,
      note: input.note?.trim() || null,
      verified: true,
    },
  });

  revalidatePath("/timer");
  return { ok: true, id: session.id };
}

/** 暂停：把"从现在开始暂停"记下来 */
export async function pauseTimer(sessionId: string) {
  const ctx = await ctxOrThrow();
  const s = await prisma.timerSession.findFirst({
    where: { id: sessionId, userId: ctx.user.id, status: "RUNNING" },
  });
  if (!s) return { ok: false };

  await prisma.timerSession.update({
    where: { id: s.id },
    data: {
      status: "PAUSED",
      pausedAt: new Date(),
      elapsedSeconds: elapsedSecondsOf(s),
      lastHeartbeatAt: new Date(),
    },
  });

  revalidatePath("/timer");
  return { ok: true };
}

/** 继续：把这次暂停的时长累加进 pausedTotalSeconds */
export async function resumeTimer(sessionId: string) {
  const ctx = await ctxOrThrow();
  const s = await prisma.timerSession.findFirst({
    where: { id: sessionId, userId: ctx.user.id, status: "PAUSED" },
  });
  if (!s) return { ok: false };

  const add = s.pausedAt ? Math.max(0, Math.floor((Date.now() - s.pausedAt.getTime()) / 1000)) : 0;

  await prisma.timerSession.update({
    where: { id: s.id },
    data: {
      status: "RUNNING",
      pausedAt: null,
      pausedTotalSeconds: { increment: add },
      lastHeartbeatAt: new Date(),
    },
  });

  revalidatePath("/timer");
  return { ok: true };
}

/**
 * 结束 / 放弃。核心结算都在这里：
 * - 服务端算净时长
 * - 按规则发分（并受单次/单日上限约束）
 * - 归到技能，重算技能累计
 * - 计时型习惯达标 → 自动打卡（此时不再另发计时分，一份动作一份奖励）
 */
export async function finishTimer(sessionId: string, abandon = false) {
  const ctx = await ctxOrThrow();

  const s = await prisma.timerSession.findFirst({
    where: { id: sessionId, userId: ctx.user.id, status: { in: ["RUNNING", "PAUSED"] } },
    include: { skill: true, habit: true },
  });
  if (!s) return { ok: false, error: "找不到进行中的计时" };

  const endedAt = new Date();
  const elapsed = elapsedSecondsOf({ ...s, endedAt });
  const minutes = Math.floor(elapsed / 60);

  const isBreak = s.mode === "POMODORO" && s.phase !== "FOCUS";
  const reachedTarget =
    s.mode !== "STOPWATCH" && s.plannedSeconds != null ? elapsed >= s.plannedSeconds : true;
  const completed = !abandon && (isBreak ? true : reachedTarget);
  const status = completed ? "COMPLETED" : "ABANDONED";

  // 太短的不留垃圾数据
  if (elapsed < 60) {
    await prisma.timerSession.delete({ where: { id: s.id } });
    revalidatePath("/timer");
    return { ok: true, discarded: true };
  }

  const rule = await resolveCreditRule(prisma, ctx.circle.id, s.skillId);
  let points = completed ? pointsFor(rule, minutes) : 0;
  if (isBreak) points = 0; // 休息不发分

  // 会触发"计时型习惯自动打卡"的，只发习惯那一份分（一个动作一份奖励）
  const todayStr = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
  let willAutoCheckin = false;
  if (
    completed &&
    s.habit &&
    s.habit.type === "TIMED" &&
    s.habit.autoCheckinOnTimer &&
    minutes >= s.habit.minTimerMinutes
  ) {
    const exists = await prisma.checkin.findFirst({
      where: { habitId: s.habit.id, userId: ctx.user.id, localDate: todayStr },
    });
    willAutoCheckin = !exists;
  }
  if (willAutoCheckin) points = 0;

  // 单日上限
  if (points > 0 && rule?.capPerDay != null) {
    const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
    const since = new Date(Date.now() - 26 * 3600_000);
    const earnedToday = await prisma.timerSession.aggregate({
      where: { userId: ctx.user.id, startedAt: { gte: since }, pointsAwarded: { gt: 0 } },
      _sum: { pointsAwarded: true },
    });
    const used = earnedToday._sum.pointsAwarded ?? 0;
    points = Math.max(0, Math.min(points, rule.capPerDay - used));
    void today;
  }

  let autoCheckin = false;

  await prisma.$transaction(async (tx) => {
    await tx.timerSession.update({
      where: { id: s.id },
      data: {
        status,
        endedAt,
        elapsedSeconds: elapsed,
        pausedAt: null,
        pointsAwarded: points,
      },
    });

    if (points > 0) {
      const wallet = await tx.wallet.upsert({
        where: { circleId_userId: { circleId: ctx.circle.id, userId: ctx.user.id } },
        create: {
          circleId: ctx.circle.id,
          userId: ctx.user.id,
          balance: points,
          totalEarned: points,
        },
        update: { balance: { increment: points }, totalEarned: { increment: points } },
      });
      await tx.pointTxn.create({
        data: {
          walletId: wallet.id,
          type: "EARN_TIMER",
          delta: points,
          balanceBefore: wallet.balance - points,
          balanceAfter: wallet.balance,
          refType: "timer",
          refId: s.id,
          reason: s.skill ? `${s.skill.name} ${minutes} 分钟` : `${minutes} 分钟专注`,
        },
      });
    }

    // 技能累计重算（不做增量加减，避免漂移）
    if (s.skillId && completed) {
      const agg = await tx.timerSession.aggregate({
        where: { skillId: s.skillId, status: "COMPLETED" },
        _sum: { elapsedSeconds: true },
      });
      await tx.skill.update({
        where: { id: s.skillId },
        data: { totalSeconds: agg._sum.elapsedSeconds ?? 0 },
      });
    }

    // 计时型习惯：达标自动打卡
    if (
      completed &&
      s.habit &&
      s.habit.type === "TIMED" &&
      s.habit.autoCheckinOnTimer &&
      minutes >= s.habit.minTimerMinutes
    ) {
      const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
      const exists = await tx.checkin.findFirst({
        where: { habitId: s.habit.id, userId: ctx.user.id, localDate: today },
      });
      if (!exists) {
        const habitPoints = s.habit.pointsPerCheckin;
        await tx.checkin.create({
          data: {
            habitId: s.habit.id,
            userId: ctx.user.id,
            localDate: today,
            quantity: 1,
            status: "APPROVED",
            source: "TIMER",
            pointsAwarded: habitPoints,
          },
        });
        if (habitPoints > 0) {
          const w2 = await tx.wallet.update({
            where: { circleId_userId: { circleId: ctx.circle.id, userId: ctx.user.id } },
            data: { balance: { increment: habitPoints }, totalEarned: { increment: habitPoints } },
          });
          await tx.pointTxn.create({
            data: {
              walletId: w2.id,
              type: "EARN_CHECKIN",
              delta: habitPoints,
              balanceBefore: w2.balance - habitPoints,
              balanceAfter: w2.balance,
              refType: "habit",
              refId: s.habit.id,
              reason: `${s.habit.title}（计时达标）`,
            },
          });
        }
        autoCheckin = true;
      }
    }
  });

  revalidatePath("/timer");
  revalidatePath("/");
  revalidatePath("/habits");
  revalidatePath("/me");

  return { ok: true, status, minutes, points, autoCheckin, isBreak, phase: s.phase, round: s.round };
}

/** 事后再归类：给未分类的会话补上技能 */
export async function assignSkill(sessionId: string, skillId: string | null) {
  const ctx = await ctxOrThrow();
  const s = await prisma.timerSession.findFirst({
    where: { id: sessionId, userId: ctx.user.id },
  });
  if (!s) return { ok: false };

  await prisma.timerSession.update({
    where: { id: s.id },
    data: { skillId: skillId || null },
  });

  // 重算新旧两个技能
  const ids = [s.skillId, skillId].filter(Boolean) as string[];
  for (const id of new Set(ids)) {
    const agg = await prisma.timerSession.aggregate({
      where: { skillId: id, status: "COMPLETED" },
      _sum: { elapsedSeconds: true },
    });
    await prisma.skill.update({
      where: { id },
      data: { totalSeconds: agg._sum.elapsedSeconds ?? 0 },
    });
  }

  revalidatePath("/timer");
  revalidatePath("/me");
  return { ok: true };
}

/** 表单版本：给未分类的记录补技能 */
export async function assignSkillFormAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  const skillId = String(formData.get("skillId") ?? "");
  await assignSkill(sessionId, skillId || null);
  redirect("/timer");
}

/** 打开页面时顺手清掉跑了一整天没动过的会话 */
export async function cleanupStaleSessions(userId: string) {
  const cutoff = new Date(Date.now() - 24 * 3600_000);
  const stale = await prisma.timerSession.findMany({
    where: { userId, status: { in: ["RUNNING", "PAUSED"] }, startedAt: { lt: cutoff } },
  });
  for (const s of stale) {
    await prisma.timerSession.update({
      where: { id: s.id },
      data: { status: "ABANDONED", endedAt: new Date(), elapsedSeconds: elapsedSecondsOf(s) },
    });
  }
}
