"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, destroySession } from "@/lib/session";


export async function registerAction(formData: FormData) {
  const nickname = String(formData.get("nickname") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!nickname) redirect("/register?error=" + encodeURIComponent("昵称不能为空"));
  if (!email.includes("@")) redirect("/register?error=" + encodeURIComponent("邮箱格式不对"));
  if (password.length < 8) redirect("/register?error=" + encodeURIComponent("密码至少 8 位"));

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) redirect("/register?error=" + encodeURIComponent("这个邮箱已经注册过了"));

  const user = await prisma.user.create({
    data: { email, nickname, passwordHash: hashPassword(password) },
  });

  // 带邀请码注册的，直接加入那个圈子
  const joinCode = String(formData.get("join") ?? "").trim().toLowerCase();
  if (joinCode) {
    const circle = await prisma.circle.findUnique({ where: { inviteCode: joinCode } });
    if (circle) {
      await prisma.circleMember.create({
        data: { circleId: circle.id, userId: user.id, role: "MEMBER" },
      });
      await prisma.wallet.upsert({
        where: { circleId_userId: { circleId: circle.id, userId: user.id } },
        create: { circleId: circle.id, userId: user.id, balance: 0 },
        update: {},
      });
      await prisma.user.update({ where: { id: user.id }, data: { activeCircleId: circle.id } });
      await createSession(user.id);
      redirect("/");
    }
  }

  await createSession(user.id);
  redirect("/welcome");
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    redirect("/login?error=" + encodeURIComponent("邮箱或密码不对"));
  }

  await createSession(user.id);

  const joinCode = String(formData.get("join") ?? "").trim().toLowerCase();
  if (joinCode) {
    const circle = await prisma.circle.findUnique({ where: { inviteCode: joinCode } });
    if (circle) {
      const already = await prisma.circleMember.findUnique({
        where: { circleId_userId: { circleId: circle.id, userId: user.id } },
      });
      if (!already) {
        await prisma.circleMember.create({ data: { circleId: circle.id, userId: user.id, role: "MEMBER" } });
        await prisma.wallet.upsert({
          where: { circleId_userId: { circleId: circle.id, userId: user.id } },
          create: { circleId: circle.id, userId: user.id, balance: 0 },
          update: {},
        });
      }
      await prisma.user.update({ where: { id: user.id }, data: { activeCircleId: circle.id } });
      redirect("/");
    }
  }

  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
