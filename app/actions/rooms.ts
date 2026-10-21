"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { pointsFor, resolveCreditRule } from "@/lib/credit";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function code() {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

async function requireCtx() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function createRoomAction(formData: FormData) {
  const ctx = await requireCtx();
  const name = String(formData.get("name") ?? "").trim().slice(0, 30) || "一起专注";
  const duration = Math.min(180, Math.max(5, Math.trunc(Number(formData.get("duration") ?? 25)) || 25));

  let c = code();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.room.findUnique({ where: { code: c } });
    if (!clash) break;
    c = code();
  }

  const room = await prisma.room.create({
    data: {
      circleId: ctx.circle.id,
      name,
      code: c,
      hostId: ctx.user.id,
      settings: { durationMinutes: duration },
    },
  });

  await prisma.roomMember.create({ data: { roomId: room.id, userId: ctx.user.id, state: "READY" } });

  revalidatePath("/rooms");
  redirect(`/rooms/${room.code}`);
}

export async function joinRoomAction(formData: FormData) {
  const ctx = await requireCtx();
  const code = String(formData.get("code") ?? "");
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room || room.circleId !== ctx.circle.id) redirect("/rooms?error=" + encodeURIComponent("找不到这个房间"));

  await prisma.roomMember.upsert({
    where: { roomId_userId: { roomId: room.id, userId: ctx.user.id } },
    create: { roomId: room.id, userId: ctx.user.id, state: "READY" },
    update: { state: "READY" },
  });

  revalidatePath(`/rooms/${code}`);
  redirect(`/rooms/${code}`);
}

export async function leaveRoomAction(formData: FormData) {
  const ctx = await requireCtx();
  const code = String(formData.get("code") ?? "");
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) redirect("/rooms");

  await prisma.roomMember.updateMany({
    where: { roomId: room.id, userId: ctx.user.id },
    data: { state: "LEFT" },
  });

  revalidatePath(`/rooms/${code}`);
  redirect("/rooms");
}

export async function startRoomAction(formData: FormData) {
  const ctx = await requireCtx();
  const code = String(formData.get("code") ?? "");
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room || room.hostId !== ctx.user.id) redirect(`/rooms/${code}`);

  const settings = (room.settings ?? {}) as { durationMinutes?: number };
  const duration = settings.durationMinutes ?? 25;
  const startedAt = new Date();

  await prisma.room.update({
    where: { id: room.id },
    data: { startedAt, endsAt: new Date(startedAt.getTime() + duration * 60_000) },
  });

  revalidatePath(`/rooms/${code}`);
  redirect(`/rooms/${code}`);
}

export async function closeRoomAction(formData: FormData) {
  const ctx = await requireCtx();
  const code = String(formData.get("code") ?? "");
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room || room.hostId !== ctx.user.id) redirect(`/rooms/${code}`);

  await prisma.room.update({ where: { id: room.id }, data: { status: "CLOSED" } });
  revalidatePath(`/rooms/${code}`);
  redirect("/rooms");
}

/** 直接把圈内人拉进房间（并给他发一条通知） */
export async function inviteMemberAction(formData: FormData) {
  const ctx = await requireCtx();
  const code = String(formData.get("code") ?? "");
  const userId = String(formData.get("userId") ?? "");

  const room = await prisma.room.findUnique({ where: { code } });
  if (!room || room.circleId !== ctx.circle.id) redirect("/rooms");

  const member = await prisma.circleMember.findFirst({
    where: { circleId: ctx.circle.id, userId, status: "ACTIVE" },
  });
  if (!member) redirect(`/rooms/${code}`);

  await prisma.roomMember.upsert({
    where: { roomId_userId: { roomId: room.id, userId } },
    create: { roomId: room.id, userId, state: "READY" },
    update: { state: "READY" },
  });

  await prisma.notification.create({
    data: {
      userId,
      type: "SYSTEM",
      title: `${ctx.user.nickname} 拉你进了自习室`,
      body: `「${room.name}」· ${((room.settings ?? {}) as { durationMinutes?: number }).durationMinutes ?? 25} 分钟`,
      link: `/rooms/${room.code}`,
    },
  });

  revalidatePath(`/rooms/${code}`);
  redirect(`/rooms/${code}?ok=` + encodeURIComponent("已拉进来"));
}

/** 把这一轮自习室的时间记进自己的技能（每人各记各的，同房间只记一次） */
export async function logRoomTimeAction(formData: FormData) {
  const ctx = await requireCtx();
  const code = String(formData.get("code") ?? "");
  const skillId = String(formData.get("skillId") ?? "") || null;

  const room = await prisma.room.findUnique({ where: { code } });
  if (!room || !room.startedAt || !room.endsAt) redirect(`/rooms/${code}`);

  const exists = await prisma.timerSession.findFirst({
    where: { userId: ctx.user.id, roomId: room.id },
  });
  if (exists) redirect(`/rooms/${code}?error=` + encodeURIComponent("这一轮已经记过了"));

  const elapsed = Math.max(0, Math.floor((room.endsAt.getTime() - room.startedAt.getTime()) / 1000));
  const minutes = Math.floor(elapsed / 60);
  const rule = await resolveCreditRule(prisma, ctx.circle.id, skillId);
  const points = pointsFor(rule, minutes);

  await prisma.$transaction(async (tx) => {
    const session = await tx.timerSession.create({
      data: {
        userId: ctx.user.id,
        circleId: ctx.circle.id,
        mode: "COUNTDOWN",
        status: "COMPLETED",
        plannedSeconds: elapsed,
        elapsedSeconds: elapsed,
        startedAt: room.startedAt!,
        endedAt: room.endsAt!,
        skillId,
        roomId: room.id,
        pointsAwarded: points,
        note: `自习室：${room.name}`,
        verified: true,
      },
    });

    if (points > 0) {
      const w = await tx.wallet.upsert({
        where: { circleId_userId: { circleId: ctx.circle.id, userId: ctx.user.id } },
        create: { circleId: ctx.circle.id, userId: ctx.user.id, balance: points, totalEarned: points },
        update: { balance: { increment: points }, totalEarned: { increment: points } },
      });
      await tx.pointTxn.create({
        data: {
          walletId: w.id,
          type: "EARN_TIMER",
          delta: points,
          balanceBefore: w.balance - points,
          balanceAfter: w.balance,
          refType: "timer",
          refId: session.id,
          reason: `自习室 ${minutes} 分钟`,
        },
      });
    }

    if (skillId) {
      const agg = await tx.timerSession.aggregate({
        where: { skillId, status: "COMPLETED" },
        _sum: { elapsedSeconds: true },
      });
      await tx.skill.update({
        where: { id: skillId },
        data: { totalSeconds: agg._sum.elapsedSeconds ?? 0 },
      });
    }
  });

  revalidatePath(`/rooms/${code}`);
  redirect(`/rooms/${code}?ok=` + encodeURIComponent("已记进你的时间"));
}
