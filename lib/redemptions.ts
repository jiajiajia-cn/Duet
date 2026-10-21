import { prisma } from "./db";

export const REDEMPTION_STATUS_TEXT: Record<string, string> = {
  OPEN: "合兑中",
  APPROVED: "待发放",
  FULFILLED: "已发放",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  REFUNDED: "已退款",
  EXPIRED: "已解散",
  REJECTED: "已拒绝",
  PENDING_APPROVAL: "待审核",
};

export function statusTone(status: string): "ok" | "warn" | "" {
  if (status === "COMPLETED" || status === "FULFILLED") return "ok";
  if (status === "OPEN" || status === "APPROVED") return "warn";
  return "";
}

/**
 * 把过期的合兑单解散：按人退分、库存回补、状态置 EXPIRED。
 * 没有定时任务，就在打开奖品相关页面时顺手扫一遍（成本极低）。
 */
export async function expireOverdueRedemptions(circleId: string) {
  const overdue = await prisma.redemption.findMany({
    where: {
      circleId,
      type: "GROUP",
      status: "OPEN",
      expiresAt: { lt: new Date() },
    },
    include: { participants: true, reward: { select: { id: true, stock: true } } },
  });

  for (const r of overdue) {
    await prisma.$transaction(async (tx) => {
      for (const p of r.participants) {
        if (p.status !== "PLEDGED" || p.points <= 0) continue;
        const wallet = await tx.wallet.update({
          where: { circleId_userId: { circleId, userId: p.userId } },
          data: { balance: { increment: p.points }, totalSpent: { decrement: p.points } },
        });
        await tx.pointTxn.create({
          data: {
            walletId: wallet.id,
            type: "REFUND",
            delta: p.points,
            balanceBefore: wallet.balance - p.points,
            balanceAfter: wallet.balance,
            refType: "redemption",
            refId: r.id,
            reason: "合兑超时解散，自动退回",
          },
        });
        await tx.redemptionParticipant.update({
          where: { id: p.id },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
      }

      if (r.reward.stock != null) {
        await tx.reward.update({
          where: { id: r.reward.id },
          data: { stock: { increment: 1 } },
        });
      }

      await tx.redemption.update({
        where: { id: r.id },
        data: { status: "EXPIRED", closedAt: new Date() },
      });
    });
  }

  return overdue.length;
}

export async function listMyRedemptions(userId: string) {
  return prisma.redemption.findMany({
    where: { participants: { some: { userId } } },
    include: {
      reward: { select: { id: true, title: true, images: true, fulfillmentType: true } },
      participants: { include: { user: { select: { nickname: true, id: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
