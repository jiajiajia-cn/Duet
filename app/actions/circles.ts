"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/guards";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function makeCode(len = 6) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = makeCode();
    const exists = await prisma.circle.findUnique({ where: { inviteCode: code } });
    if (!exists) return code;
  }
  return makeCode(10);
}


/** 建一个圈子并成为圈主 */
export async function createCircleAction(formData: FormData) {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim().slice(0, 30) || "我的圈子";

  const circle = await prisma.circle.create({
    data: { name, ownerId: userId, inviteCode: await uniqueCode() },
  });

  await prisma.circleMember.create({
    data: { circleId: circle.id, userId, role: "OWNER" },
  });
  await prisma.wallet.upsert({
    where: { circleId_userId: { circleId: circle.id, userId } },
    create: { circleId: circle.id, userId, balance: 0 },
    update: {},
  });
  // 新圈子自动给一套默认的计时计分规则（可改）
  await prisma.creditRule.create({
    data: {
      circleId: circle.id,
      scope: "CIRCLE",
      mode: "TIER",
      tiers: [],
      minMinutes: 1,
    },
  });
  await prisma.user.update({ where: { id: userId }, data: { activeCircleId: circle.id } });

  revalidatePath("/");
  redirect("/");
}

/** 用邀请码加入圈子 */
export async function joinCircleAction(formData: FormData) {
  const userId = await requireUserId();
  const raw = String(formData.get("code") ?? "").trim().toLowerCase();
  if (!raw) redirect("/welcome?error=" + encodeURIComponent("请输入邀请码"));

  const circle = await prisma.circle.findUnique({ where: { inviteCode: raw } });
  if (!circle) {
    redirect("/welcome?error=" + encodeURIComponent("邀请码不对，再确认一下"));
  }

  const existing = await prisma.circleMember.findUnique({
    where: { circleId_userId: { circleId: circle.id, userId } },
  });

  if (existing) {
    if (existing.status === "ACTIVE") {
      // 已经在里面了，直接切过去
      await prisma.user.update({ where: { id: userId }, data: { activeCircleId: circle.id } });
      revalidatePath("/");
      redirect("/");
    }
    await prisma.circleMember.update({
      where: { id: existing.id },
      data: { status: "ACTIVE", leftAt: null },
    });
  } else {
    await prisma.circleMember.create({
      data: { circleId: circle.id, userId, role: "MEMBER" },
    });
  }

  await prisma.wallet.upsert({
    where: { circleId_userId: { circleId: circle.id, userId } },
    create: { circleId: circle.id, userId, balance: 0 },
    update: {},
  });
  await prisma.user.update({ where: { id: userId }, data: { activeCircleId: circle.id } });

  revalidatePath("/");
  redirect("/");
}

/** 在多个圈子之间切换 */
export async function switchCircleAction(formData: FormData) {
  const userId = await requireUserId();
  const circleId = String(formData.get("circleId") ?? "");

  const member = await prisma.circleMember.findFirst({
    where: { circleId, userId, status: "ACTIVE" },
  });
  if (!member) redirect("/settings");

  await prisma.user.update({ where: { id: userId }, data: { activeCircleId: circleId } });

  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/");
}

/** 退出圈子（圈主不能退，除非转让） */
export async function leaveCircleAction(formData: FormData) {
  const userId = await requireUserId();
  const circleId = String(formData.get("circleId") ?? "");

  const member = await prisma.circleMember.findFirst({
    where: { circleId, userId, status: "ACTIVE" },
    include: { circle: true },
  });
  if (!member) redirect("/settings");
  if (member.role === "OWNER") {
    redirect("/settings?error=" + encodeURIComponent("圈主不能直接退出"));
  }

  await prisma.circleMember.update({
    where: { id: member.id },
    data: { status: "LEFT", leftAt: new Date() },
  });

  const next = await prisma.circleMember.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { joinedAt: "asc" },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { activeCircleId: next?.circleId ?? null },
  });

  revalidatePath("/");
  redirect(next ? "/" : "/welcome");
}
