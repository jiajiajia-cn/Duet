"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";

/** 圈主给成员手动加/扣分，必须写理由，流水里留 operator */
export async function adjustPointsAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") redirect("/admin/members");

  const targetId = String(formData.get("userId") ?? "");
  const delta = Math.trunc(Number(formData.get("delta") ?? 0));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 60) || "手动调整";

  if (!delta) redirect("/admin/members?error=" + encodeURIComponent("分差不能是 0"));

  const member = await prisma.circleMember.findFirst({
    where: { circleId: ctx.circle.id, userId: targetId, status: "ACTIVE" },
  });
  if (!member) redirect("/admin/members?error=" + encodeURIComponent("找不到这个成员"));

  const wallet = await prisma.wallet.findUnique({
    where: { circleId_userId: { circleId: ctx.circle.id, userId: targetId } },
  });
  if (wallet && wallet.balance + delta < 0) {
    redirect("/admin/members?error=" + encodeURIComponent("扣完会变成负数，已拦下"));
  }

  await prisma.$transaction(async (tx) => {
    const w = await tx.wallet.upsert({
      where: { circleId_userId: { circleId: ctx.circle.id, userId: targetId } },
      create: {
        circleId: ctx.circle.id,
        userId: targetId,
        balance: Math.max(0, delta),
        totalEarned: Math.max(0, delta),
        totalSpent: Math.max(0, -delta),
      },
      update: {
        balance: { increment: delta },
        ...(delta > 0 ? { totalEarned: { increment: delta } } : { totalSpent: { increment: -delta } }),
      },
    });

    await tx.pointTxn.create({
      data: {
        walletId: w.id,
        type: "ADJUST",
        delta,
        balanceBefore: w.balance - delta,
        balanceAfter: w.balance,
        refType: "manual",
        reason,
        operatorId: ctx.user.id,
      },
    });

    await tx.notification.create({
      data: {
        userId: targetId,
        type: "SYSTEM",
        title: delta > 0 ? `收到 ${delta} 分` : `被扣了 ${-delta} 分`,
        body: `${ctx.user.nickname}：${reason}`,
        link: "/me",
      },
    });
  });

  revalidatePath("/admin/members");
  revalidatePath("/me");
  redirect("/admin/members?ok=" + encodeURIComponent(`已${delta > 0 ? "加" : "扣"} ${Math.abs(delta)} 分`));
}
