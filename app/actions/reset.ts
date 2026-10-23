"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";

/** 可以清空的范围 */
const SCOPES = ["checkins", "points", "timers", "redemptions", "all"] as const;
type Scope = (typeof SCOPES)[number];

export async function resetDataAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    redirect("/settings?error=" + encodeURIComponent("只有圈主能清空记录"));
  }

  const scope = String(formData.get("scope") ?? "") as Scope;
  const confirm = String(formData.get("confirm") ?? "").trim();

  if (!SCOPES.includes(scope)) redirect("/settings/danger?error=" + encodeURIComponent("参数不对"));
  if (confirm !== "清空") {
    redirect("/settings/danger?error=" + encodeURIComponent("请按提示输入「清空」两个字"));
  }

  const circleId = ctx.circle.id;

  const wipeCheckins = scope === "checkins" || scope === "all";
  const wipePoints = scope === "points" || scope === "all";
  const wipeTimers = scope === "timers" || scope === "all";
  const wipeRedemptions = scope === "redemptions" || scope === "all";

  await prisma.$transaction(async (tx) => {
    if (wipeRedemptions) {
      await tx.redemptionParticipant.deleteMany({ where: { redemption: { circleId } } });
      await tx.redemption.deleteMany({ where: { circleId } });
      const rewardIds = (await tx.reward.findMany({ where: { circleId }, select: { id: true } })).map((r) => r.id);
      if (rewardIds.length) {
        await tx.rewardQuota.deleteMany({ where: { rewardId: { in: rewardIds } } });
      }
    }

    if (wipeCheckins) {
      await tx.checkin.deleteMany({ where: { habit: { circleId } } });
      await tx.habitStat.deleteMany({ where: { habit: { circleId } } });
    }

    if (wipeTimers) {
      await tx.timerSession.deleteMany({ where: { circleId } });
    }

    if (wipePoints) {
      await tx.pointTxn.deleteMany({ where: { wallet: { circleId } } });
      await tx.wallet.updateMany({
        where: { circleId },
        data: { balance: 0, totalEarned: 0, totalSpent: 0 },
      });
    }

    if (scope === "all") {
      await tx.makeupCard.deleteMany({ where: { circleId } });
      await tx.notification.deleteMany({ where: { userId: ctx.user.id } });
    }
  });

  revalidatePath("/");
  revalidatePath("/habits");
  revalidatePath("/rewards");
  revalidatePath("/report");
  revalidatePath("/me");
  revalidatePath("/orders");

  const label =
    scope === "all" ? "全部记录" : scope === "checkins" ? "打卡记录" : scope === "points" ? "积分记录" : scope === "timers" ? "计时记录" : "兑换记录";

  redirect("/settings/danger?ok=" + encodeURIComponent(`${label}已清空`));
}
