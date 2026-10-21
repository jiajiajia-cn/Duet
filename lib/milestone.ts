import type { Prisma } from "@prisma/client";

/** 默认的连续打卡里程碑：连续 7 / 30 / 100 天额外奖励 */
export const DEFAULT_MILESTONES: Record<string, number> = {
  "7": 20,
  "30": 100,
  "100": 500,
};

export function milestonesOf(settings: unknown): Record<string, number> {
  const s = (settings ?? {}) as { milestoneBonus?: Record<string, number> };
  const raw = s.milestoneBonus;
  if (raw && typeof raw === "object" && Object.keys(raw).length > 0) return raw;
  return DEFAULT_MILESTONES;
}

type Tx = Prisma.TransactionClient;

/**
 * 连续达标时发里程碑奖励。同一个人同一个习惯的同一档只发一次
 * （用 pointTxn 的 refType/refId 去重，不需要额外的表）。
 */
export async function awardMilestone(
  tx: Tx,
  opts: {
    circleId: string;
    userId: string;
    habitId: string;
    habitTitle: string;
    streakDays: number;
    settings: unknown;
  },
): Promise<number> {
  const table = milestonesOf(opts.settings);
  const bonus = table[String(opts.streakDays)];
  if (!bonus || bonus <= 0) return 0;

  const refId = `${opts.habitId}:${opts.streakDays}`;
  const already = await tx.pointTxn.findFirst({
    where: { refType: "milestone", refId },
  });
  if (already) return 0;

  const w = await tx.wallet.upsert({
    where: { circleId_userId: { circleId: opts.circleId, userId: opts.userId } },
    create: {
      circleId: opts.circleId,
      userId: opts.userId,
      balance: bonus,
      totalEarned: bonus,
    },
    update: { balance: { increment: bonus }, totalEarned: { increment: bonus } },
  });

  await tx.pointTxn.create({
    data: {
      walletId: w.id,
      type: "EARN_BONUS",
      delta: bonus,
      balanceBefore: w.balance - bonus,
      balanceAfter: w.balance,
      refType: "milestone",
      refId,
      reason: `${opts.habitTitle} 连续 ${opts.streakDays} 天`,
    },
  });

  await tx.notification.create({
    data: {
      userId: opts.userId,
      type: "MILESTONE",
      title: `连续 ${opts.streakDays} 天！`,
      body: `${opts.habitTitle} 拿到了 +${bonus} 分奖励`,
      link: "/",
    },
  });

  return bonus;
}
