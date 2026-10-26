"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";

function intOrNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Math.trunc(Number(s));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseSkill(fd: FormData) {
  return {
    name: String(fd.get("name") ?? "").trim().slice(0, 20),
    icon: String(fd.get("icon") ?? "🎯").trim().slice(0, 4) || "🎯",
    color: String(fd.get("color") ?? "#6366f1"),
    description: String(fd.get("description") ?? "").trim().slice(0, 200) || null,
    targetHours: intOrNull(fd.get("targetHours")),
  };
}

async function requireCtx() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function createSkillAction(fd: FormData) {
  const ctx = await requireCtx();
  const data = parseSkill(fd);
  if (!data.name) redirect("/skills/new?error=" + encodeURIComponent("名字不能为空"));

  const skill = await prisma.skill.create({
    data: { ...data, circleId: ctx.circle.id, ownerId: ctx.user.id },
  });

  revalidatePath("/skills");
  revalidatePath("/timer");
  redirect(`/skills/${skill.id}?ok=` + encodeURIComponent("已创建"));
}

export async function updateSkillAction(fd: FormData) {
  const ctx = await requireCtx();
  const id = String(fd.get("id") ?? "");
  const skill = await prisma.skill.findFirst({ where: { id, circleId: ctx.circle.id } });
  if (!skill || skill.ownerId !== ctx.user.id) redirect("/skills");

  const data = parseSkill(fd);
  if (!data.name) redirect(`/skills/${id}/edit?error=` + encodeURIComponent("名字不能为空"));

  await prisma.skill.update({ where: { id }, data });

  revalidatePath("/skills");
  revalidatePath(`/skills/${id}`);
  redirect(`/skills/${id}?ok=` + encodeURIComponent("已保存"));
}

export async function setSkillStatusAction(fd: FormData) {
  const ctx = await requireCtx();
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "ACTIVE");
  if (!["ACTIVE", "ARCHIVED"].includes(status)) redirect("/skills");

  await prisma.skill.updateMany({
    where: { id, circleId: ctx.circle.id, ownerId: ctx.user.id },
    data: { status: status as "ACTIVE" | "ARCHIVED" },
  });

  revalidatePath("/skills");
  revalidatePath(`/skills/${id}`);
  redirect("/skills?ok=" + encodeURIComponent(status === "ARCHIVED" ? "已归档" : "已恢复"));
}

/** 彻底删除技能（计时记录保留，只是解除关联） */
export async function deleteSkillAction(fd: FormData) {
  const ctx = await requireCtx();
  const id = String(fd.get("id") ?? "");

  const skill = await prisma.skill.findFirst({ where: { id, circleId: ctx.circle.id } });
  if (!skill) redirect("/skills");
  if (skill.ownerId !== ctx.user.id && ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    redirect("/skills?error=" + encodeURIComponent("只能删自己的技能"));
  }

  await prisma.$transaction(async (tx) => {
    await tx.timerSession.updateMany({ where: { skillId: id }, data: { skillId: null } });
    await tx.skill.delete({ where: { id } });
  });

  revalidatePath("/skills");
  revalidatePath("/timer");
  revalidatePath("/me");
  redirect("/skills?ok=" + encodeURIComponent(`已删除「${skill.name}」`));
}
