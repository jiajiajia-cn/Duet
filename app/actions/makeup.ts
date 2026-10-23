"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { localDateString, shiftDate } from "@/lib/date";
import { makeupPrice, recomputeStreak } from "@/lib/makeup";

class BizError extends Error {}

async function requireCtx() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** 圈主设置补签卡价格（0 = 关闭） */
export async function setMakeupPriceAction(formData: FormData) {
  const ctx = await requireCtx();
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    redirect("/rewards?error=" + encodeURIComponent("只有圈主能改价格"));
  }

  const raw = Number(String(formData.get("price") ?? "0"));
  const price = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 0;

  const settings = (ctx.circle.settings ?? {}) as Record<string, unknown>;
  await prisma.circle.update({
    where: { id: ctx.circle.id },
    data: { settings: { ...settings, makeupCardPrice: price } },
  });

  revalidatePath("/rewards");
  redirect("/rewards?ok=" + encodeURIComponent(price ? `补签卡价格已设为 ${price} 分` : "已关闭补签卡"));
}

/** 花积分买一张补签卡 */
export async function buyMakeupCardAction() {
  const ctx = await requireCtx();
  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
  const price = makeupPrice(ctx.circle.settings);

  if (!price) redirect("/rewards?error=" + encodeURIComponent("圈主还没开启补签卡"));

  try {
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { circleId_userId: { circleId: ctx.circle.id, userId: ctx.user.id } },
      });
      if (!wallet || wallet.balance < price) throw new BizError("积分不够");

      const after = wallet.balance - price;
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: after, totalSpent: { increment: price } },
      });
      await tx.pointTxn.create({
        data: {
          walletId: wallet.id,
          type: "SPEND_REDEEM",
          delta: -price,
          balanceBefore: wallet.balance,
          balanceAfter: after,
          refType: "makeup",
          reason: "买补签卡",
        },
      });
      await tx.makeupCard.create({
        data: { circleId: ctx.circle.id, userId: ctx.user.id, price },
      });
    });
  } catch (e) {
    if (e instanceof BizError) {
      redirect("/rewards?error=" + encodeURIComponent(e.message));
    }
    // 数据库还没建表之类的异常，别把整页打崩
    redirect("/rewards?error=" + encodeURIComponent("暂时用不了补签卡，请稍后再试"));
  }

  revalidatePath("/rewards");
  revalidatePath("/makeup");
  redirect("/makeup?ok=" + encodeURIComponent("买好了，挑一天补上"));
}

/** 用一张补签卡修复某天 */
export async function useMakeupCardAction(formData: FormData) {
  const ctx = await requireCtx();
  const habitId = String(formData.get("habitId") ?? "");
  const date = String(formData.get("date") ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/makeup?error=" + encodeURIComponent("日期不对"));

  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
  const oldest = shiftDate(today, -7);
  if (date >= today || date < oldest) {
    redirect("/makeup?error=" + encodeURIComponent("只能补最近 7 天，且不能补今天"));
  }

  const habit = await prisma.habit.findFirst({ where: { id: habitId, circleId: ctx.circle.id } });
  if (!habit) redirect("/makeup?error=" + encodeURIComponent("习惯不存在"));
  if (habit.ownerId !== ctx.user.id && !habit.collaborative) {
    redirect("/makeup?error=" + encodeURIComponent("这个习惯不是你名下的"));
  }

  try {
    await prisma.$transaction(async (tx) => {
      const card = await tx.makeupCard.findFirst({
        where: { circleId: ctx.circle.id, userId: ctx.user.id, usedAt: null },
        orderBy: { createdAt: "asc" },
      });
      if (!card) throw new BizError("没有可用的补签卡");

      const exists = await tx.checkin.findFirst({ where: { habitId, userId: ctx.user.id, localDate: date } });
      if (exists) throw new BizError("这天已经打过卡了");

      // 补签只修连续天数，不发积分
      await tx.checkin.create({
        data: {
          habitId,
          userId: ctx.user.id,
          localDate: date,
          seq: 1,
          quantity: 1,
          status: "APPROVED",
          source: "MAKEUP",
          pointsAwarded: 0,
          note: "补签",
        },
      });

      await tx.makeupCard.update({
        where: { id: card.id },
        data: { usedAt: new Date(), usedOn: date, habitId },
      });

      await recomputeStreak(tx, habitId, ctx.user.id, today);
    });
  } catch (e) {
    if (e instanceof BizError) {
      redirect("/makeup?error=" + encodeURIComponent(e.message));
    }
    redirect("/makeup?error=" + encodeURIComponent("补签失败，请稍后再试"));
  }

  revalidatePath("/");
  revalidatePath("/habits");
  revalidatePath("/makeup");
  redirect("/makeup?ok=" + encodeURIComponent("补好了，连续天数已恢复"));
}
