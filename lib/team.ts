import type { Prisma, Habit } from "@prisma/client";
import { shiftDate } from "./date";

type Tx = Prisma.TransactionClient;

/** 这个习惯在某天需要几个人一起完成 */
export async function teamSize(tx: Tx, circleId: string): Promise<number> {
  return tx.circleMember.count({ where: { circleId, status: "ACTIVE" } });
}

/** 每人该得多少分（计量型按数量） */
export function teamPoints(habit: Pick<Habit, "type" | "pointsPerCheckin" | "pointsPerUnit">, quantity = 1) {
  const base =
    habit.type === "QUANTITY"
      ? habit.pointsPerUnit * Math.max(1, quantity)
      : habit.pointsPerCheckin;
  return Math.max(0, Math.trunc(base));
}

/**
 * 合作打卡：所有人都打卡后，一次性给每个人发分。
 * 已经发过分的（pointsAwarded > 0）跳过，所以可以重复调用。
 */
export async function awardTeamIfComplete(
  tx: Tx,
  opts: { habit: Habit; date: string; circleId: string },
): Promise<{ completed: boolean; done: number; total: number; awarded: number }> {
  const total = await teamSize(tx, opts.circleId);
  const checkins = await tx.checkin.findMany({
    where: { habitId: opts.habit.id, localDate: opts.date, status: "APPROVED" },
  });
  const done = checkins.length;
  if (total === 0 || done < total) {
    return { completed: false, done, total, awarded: 0 };
  }

  let awarded = 0;
  const yesterday = shiftDate(opts.date, -1);

  for (const c of checkins) {
    if (c.pointsAwarded > 0) continue;
    const points = teamPoints(opts.habit, c.quantity);
    if (points <= 0) continue;

    const w = await tx.wallet.upsert({
      where: { circleId_userId: { circleId: opts.circleId, userId: c.userId } },
      create: {
        circleId: opts.circleId,
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
        reason: `${opts.habit.title}（一起打卡）`,
      },
    });

    await tx.checkin.update({ where: { id: c.id }, data: { pointsAwarded: points } });

    // 连续天数
    const stat = await tx.habitStat.findUnique({
      where: { habitId_userId: { habitId: opts.habit.id, userId: c.userId } },
    });
    let current = 1;
    if (stat?.lastDoneDate === opts.date) current = stat.currentStreak;
    else if (stat?.lastDoneDate === yesterday) current = stat.currentStreak + 1;
    const best = Math.max(stat?.bestStreak ?? 0, current);

    await tx.habitStat.upsert({
      where: { habitId_userId: { habitId: opts.habit.id, userId: c.userId } },
      create: {
        habitId: opts.habit.id,
        userId: c.userId,
        currentStreak: current,
        bestStreak: best,
        lastDoneDate: opts.date,
        totalDone: 1,
      },
      update: {
        currentStreak: current,
        bestStreak: best,
        lastDoneDate: opts.date,
        totalDone: { increment: 1 },
      },
    });

    awarded += 1;
  }

  return { completed: true, done, total, awarded };
}
