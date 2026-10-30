"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";

class BizError extends Error {}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** 扣分 + 写流水（必须在事务里调用） */
async function charge(
  tx: Tx,
  circleId: string,
  userId: string,
  points: number,
  refType: string,
  refId: string,
  reason: string,
) {
  const wallet = await tx.wallet.findUnique({
    where: { circleId_userId: { circleId, userId } },
  });
  if (!wallet || wallet.balance < points) throw new BizError("积分不够");

  const updated = await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { decrement: points }, totalSpent: { increment: points } },
  });

  await tx.pointTxn.create({
    data: {
      walletId: wallet.id,
      type: "SPEND_REDEEM",
      delta: -points,
      balanceBefore: wallet.balance,
      balanceAfter: updated.balance,
      refType,
      refId,
      reason,
    },
  });

  return updated;
}

function snapshotOf(r: {
  title: string;
  pointsCost: number;
  images: Prisma.JsonValue;
  description: string | null;
  fulfillmentType: string;
}): Prisma.InputJsonObject {
  return {
    title: r.title,
    pointsCost: r.pointsCost,
    images: (r.images ?? []) as Prisma.InputJsonValue,
    description: r.description,
    fulfillmentType: r.fulfillmentType,
  };
}

/** 直接兑换（不审核：积分够就成立） */
export async function redeemAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const rewardId = String(formData.get("rewardId") ?? "");
  const reward = await prisma.reward.findFirst({
    where: { id: rewardId, circleId: ctx.circle.id },
  });
  if (!reward) redirect("/rewards");
  if (reward.status !== "ACTIVE") {
    redirect(`/rewards/${rewardId}?error=` + encodeURIComponent("这个奖品当前不可兑换"));
  }

  let newId = "";
  try {
    await prisma.$transaction(async (tx) => {
      // 限兑
      const used = await tx.redemption.count({
        where: {
          rewardId,
          initiatorId: ctx.user.id,
          status: { in: ["OPEN", "APPROVED", "FULFILLED", "COMPLETED"] },
        },
      });
      // limitPerUser = 0 表示每人无限次\n  if (reward.limitPerUser > 0 && used >= reward.limitPerUser) throw new BizError("已达每人限兑次数");

      // 库存（条件更新，禁止先查后改）
      if (reward.stock != null) {
        const r = await tx.reward.updateMany({
          where: { id: rewardId, stock: { gte: 1 } },
          data: { stock: { decrement: 1 } },
        });
        if (r.count === 0) throw new BizError("手慢了，已经被换完");
      }

      const redemption = await tx.redemption.create({
        data: {
          circleId: ctx.circle.id,
          rewardId,
          type: "SINGLE",
          status: "APPROVED",
          initiatorId: ctx.user.id,
          recipientId: ctx.user.id,
          snapshot: snapshotOf(reward),
          pointsCost: reward.pointsCost,
          raisedPoints: reward.pointsCost,
        },
      });
      newId = redemption.id;

      await charge(tx, ctx.circle.id, ctx.user.id, reward.pointsCost, "redemption", redemption.id, reward.title);

      await tx.redemptionParticipant.create({
        data: { redemptionId: redemption.id, userId: ctx.user.id, points: reward.pointsCost },
      });

      // 虚拟奖品当场履约
      if (reward.fulfillmentType === "VIRTUAL") {
        await tx.redemption.update({
          where: { id: redemption.id },
          data: { status: "FULFILLED", fulfilledAt: new Date(), fulfillmentInfo: { note: "虚拟奖品，自动发放" } },
        });
      }
    });
  } catch (e) {
    if (e instanceof BizError) {
      redirect(`/rewards/${rewardId}?error=` + encodeURIComponent(e.message));
    }
    throw e;
  }

  revalidatePath("/rewards");
  revalidatePath("/orders");
  redirect(`/orders?new=${newId}`);
}

/** 发起合兑：我先出一部分，等对方补 */
export async function startGroupAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const rewardId = String(formData.get("rewardId") ?? "");
  const myPoints = Math.trunc(Number(formData.get("myPoints") ?? 0));

  const reward = await prisma.reward.findFirst({ where: { id: rewardId, circleId: ctx.circle.id } });
  if (!reward) redirect("/rewards");
  if (reward.status !== "ACTIVE") redirect(`/rewards/${rewardId}?error=` + encodeURIComponent("这个奖品当前不可兑换"));
  if (!Number.isFinite(myPoints) || myPoints < 1) {
    redirect(`/rewards/${rewardId}?error=` + encodeURIComponent("至少出 1 分"));
  }
  if (myPoints >= reward.pointsCost) {
    redirect(`/rewards/${rewardId}?error=` + encodeURIComponent("你的分就够了，直接兑换吧"));
  }

  try {
    await prisma.$transaction(async (tx) => {
      const open = await tx.redemption.count({
        where: { rewardId, type: "GROUP", status: "OPEN" },
      });
      if (open > 0) throw new BizError("这个奖品已经有人在合兑了，先加入那个");

      if (reward.stock != null) {
        const r = await tx.reward.updateMany({
          where: { id: rewardId, stock: { gte: 1 } },
          data: { stock: { decrement: 1 } },
        });
        if (r.count === 0) throw new BizError("手慢了，已经被换完");
      }

      const redemption = await tx.redemption.create({
        data: {
          circleId: ctx.circle.id,
          rewardId,
          type: "GROUP",
          status: "OPEN",
          initiatorId: ctx.user.id,
          recipientId: ctx.user.id,
          snapshot: snapshotOf(reward),
          pointsCost: reward.pointsCost,
          raisedPoints: myPoints,
          expiresAt: new Date(Date.now() + 24 * 3600_000),
        },
      });

      await charge(tx, ctx.circle.id, ctx.user.id, myPoints, "redemption", redemption.id, `${reward.title}（合兑）`);
      await tx.redemptionParticipant.create({
        data: { redemptionId: redemption.id, userId: ctx.user.id, points: myPoints },
      });
    });
  } catch (e) {
    if (e instanceof BizError) redirect(`/rewards/${rewardId}?error=` + encodeURIComponent(e.message));
    throw e;
  }

  revalidatePath(`/rewards/${rewardId}`);
  revalidatePath("/orders");
  redirect(`/rewards/${rewardId}?group=1`);
}

/** 加入合兑，出自己那份 */
export async function joinGroupAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const redemptionId = String(formData.get("redemptionId") ?? "");
  const points = Math.trunc(Number(formData.get("points") ?? 0));

  const r = await prisma.redemption.findFirst({
    where: { id: redemptionId, circleId: ctx.circle.id },
    include: { participants: true },
  });
  if (!r || r.status !== "OPEN") redirect("/rewards");
  if (r.expiresAt && r.expiresAt < new Date()) {
    redirect(`/rewards/${r.rewardId}?error=` + encodeURIComponent("这单已经过期了"));
  }
  if (r.participants.some((p) => p.userId === ctx.user.id)) {
    redirect(`/rewards/${r.rewardId}?error=` + encodeURIComponent("你已经在这单里了"));
  }

  const remaining = r.pointsCost - r.raisedPoints;
  const pay = Math.min(Math.max(1, points), remaining);

  try {
    await prisma.$transaction(async (tx) => {
      await charge(tx, ctx.circle.id, ctx.user.id, pay, "redemption", r.id, `${r.snapshot && (r.snapshot as { title?: string }).title}（合兑）`);
      await tx.redemptionParticipant.create({
        data: { redemptionId: r.id, userId: ctx.user.id, points: pay },
      });

      const raised = r.raisedPoints + pay;
      await tx.redemption.update({
        where: { id: r.id },
        data: {
          raisedPoints: raised,
          status: raised >= r.pointsCost ? "APPROVED" : "OPEN",
        },
      });
    });
  } catch (e) {
    if (e instanceof BizError) redirect(`/rewards/${r.rewardId}?error=` + encodeURIComponent(e.message));
    throw e;
  }

  revalidatePath(`/rewards/${r.rewardId}`);
  revalidatePath("/orders");
  redirect(`/orders?joined=1`);
}

/** 取消 / 解散：只要还没发放，就按人退分、库存回补 */
export async function cancelRedemptionAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const id = String(formData.get("redemptionId") ?? "");
  const r = await prisma.redemption.findFirst({
    where: { id, circleId: ctx.circle.id },
    include: { participants: true },
  });
  if (!r) redirect("/orders");
  if (!["OPEN", "APPROVED"].includes(r.status)) {
    redirect("/orders?error=" + encodeURIComponent("已经发放的单子不能取消"));
  }
  const isOwner = r.initiatorId === ctx.user.id;
  const isAdmin = ctx.role === "OWNER" || ctx.role === "ADMIN";
  if (!isOwner && !isAdmin) redirect("/orders?error=" + encodeURIComponent("只有发起人或圈主能取消"));

  await prisma.$transaction(async (tx) => {
    for (const p of r.participants) {
      if (p.status !== "PLEDGED" || p.points <= 0) continue;
      const w = await tx.wallet.update({
        where: { circleId_userId: { circleId: ctx.circle.id, userId: p.userId } },
        data: { balance: { increment: p.points }, totalSpent: { decrement: p.points } },
      });
      await tx.pointTxn.create({
        data: {
          walletId: w.id,
          type: "REFUND",
          delta: p.points,
          balanceBefore: w.balance - p.points,
          balanceAfter: w.balance,
          refType: "redemption",
          refId: r.id,
          reason: "兑换取消，自动退回",
        },
      });
      await tx.redemptionParticipant.update({
        where: { id: p.id },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
    }

    if (r.rewardId) {
      const reward = await tx.reward.findUnique({ where: { id: r.rewardId } });
      if (reward?.stock != null) {
        await tx.reward.update({ where: { id: reward.id }, data: { stock: { increment: 1 } } });
      }
    }

    await tx.redemption.update({
      where: { id: r.id },
      data: { status: "CANCELLED", closedAt: new Date() },
    });
  });

  revalidatePath("/orders");
  revalidatePath("/admin/orders");
  redirect("/orders?cancelled=1");
}

/** 管理员：标记已发放 */
export async function fulfillAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") redirect("/rewards");

  const id = String(formData.get("redemptionId") ?? "");
  await prisma.redemption.updateMany({
    where: { id, circleId: ctx.circle.id, status: "APPROVED" },
    data: { status: "FULFILLED", fulfilledAt: new Date() },
  });

  revalidatePath("/admin/orders");
  revalidatePath("/orders");
  redirect("/admin/orders?ok=" + encodeURIComponent("已标记发放"));
}

/** 领取人确认完成 */
export async function completeAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const id = String(formData.get("redemptionId") ?? "");
  await prisma.redemption.updateMany({
    where: { id, circleId: ctx.circle.id, recipientId: ctx.user.id, status: "FULFILLED" },
    data: { status: "COMPLETED", closedAt: new Date() },
  });

  revalidatePath("/orders");
  redirect("/orders");
}
