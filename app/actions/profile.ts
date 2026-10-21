"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { saveImage } from "@/lib/upload";

export async function updateProfileAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const nickname = String(formData.get("nickname") ?? "").trim().slice(0, 20);
  const timezone = String(formData.get("timezone") ?? "").trim() || ctx.user.timezone;
  const dayStartHour = Math.min(6, Math.max(0, Math.trunc(Number(formData.get("dayStartHour") ?? 0)) || 0));
  const weekStart = Math.trunc(Number(formData.get("weekStart") ?? 1)) === 0 ? 0 : 1;

  const file = formData.get("avatar");
  let avatarUrl: string | undefined;
  if (file instanceof File && file.size > 0) {
    try {
      avatarUrl = await saveImage(file);
    } catch (e) {
      redirect("/settings?error=" + encodeURIComponent((e as Error).message));
    }
  }

  await prisma.user.update({
    where: { id: ctx.user.id },
    data: {
      ...(nickname ? { nickname } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      timezone,
      dayStartHour,
      weekStart,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/me");
  revalidatePath("/");
  redirect("/settings?ok=" + encodeURIComponent("已保存"));
}

export async function updateCircleAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") redirect("/settings");

  const name = String(formData.get("name") ?? "").trim().slice(0, 30);
  const rotate = formData.get("rotate") === "on";

  const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
  let inviteCode = ctx.circle.inviteCode;
  if (rotate) {
    let code = "";
    for (let i = 0; i < 6; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    const clash = await prisma.circle.findUnique({ where: { inviteCode: code } });
    if (!clash) inviteCode = code;
  }

  await prisma.circle.update({
    where: { id: ctx.circle.id },
    data: { ...(name ? { name } : {}), inviteCode },
  });

  revalidatePath("/settings");
  redirect("/settings?ok=" + encodeURIComponent(rotate ? "已换新邀请码" : "已保存"));
}
