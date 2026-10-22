"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { saveImage } from "@/lib/upload";

function pickImage(formData: FormData): File | null {
  const f = formData.get("image");
  return f instanceof File && f.size > 0 ? f : null;
}

function num(v: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function requireMember() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

function isManager(role: string) {
  return role === "OWNER" || role === "ADMIN";
}

/** 只有圈主、或者奖品是自己建的，才能改 */
async function requireRewardEditor(id: string) {
  const ctx = await requireMember();
  const reward = await prisma.reward.findFirst({ where: { id, circleId: ctx.circle.id } });
  if (!reward) redirect("/rewards");
  if (!isManager(ctx.role) && reward.createdBy !== ctx.user.id) {
    redirect("/rewards?error=" + encodeURIComponent("只能改自己上架的奖品"));
  }
  return { ctx, reward };
}

export async function createRewardAction(formData: FormData) {
  const ctx = await requireMember();

  const title = String(formData.get("title") ?? "").trim();
  const pointsCost = num(formData.get("pointsCost"));
  if (!title) redirect("/rewards/new?error=" + encodeURIComponent("名字不能为空"));
  if (pointsCost < 1) redirect("/rewards/new?error=" + encodeURIComponent("积分价至少 1"));

  let images: string[] = [];
  const file = pickImage(formData);
  if (file) {
    try {
      images = [await saveImage(file)];
    } catch (e) {
      redirect("/rewards/new?error=" + encodeURIComponent((e as Error).message));
    }
  }

  const reward = await prisma.reward.create({
    data: {
      circleId: ctx.circle.id,
      createdBy: ctx.user.id,
      title,
      description: String(formData.get("description") ?? "").trim() || null,
      images,
      pointsCost,
      stock: intOrNull(formData.get("stock")),
      limitPerUser: Math.max(1, num(formData.get("limitPerUser"), 1)),
      cooldownDays: Math.max(0, num(formData.get("cooldownDays"), 0)),
      category: String(formData.get("category") ?? "").trim() || "奖品",
      fulfillmentType: (String(formData.get("fulfillmentType") ?? "OFFLINE") as "VIRTUAL" | "PHYSICAL" | "OFFLINE"),
      status: "ACTIVE",
    },
  });

  revalidatePath("/rewards");
  revalidatePath("/admin/rewards");
  redirect(`/rewards/${reward.id}?created=1`);
}

export async function updateRewardAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { ctx, reward } = await requireRewardEditor(id);

  const file = pickImage(formData);
  let images = reward.images as string[];
  if (file) {
    try {
      images = [await saveImage(file)];
    } catch (e) {
      redirect(`/rewards/${id}/edit?error=` + encodeURIComponent((e as Error).message));
    }
  }

  await prisma.reward.update({
    where: { id },
    data: {
      title: String(formData.get("title") ?? reward.title).trim() || reward.title,
      description: String(formData.get("description") ?? "").trim() || null,
      pointsCost: Math.max(1, num(formData.get("pointsCost"), reward.pointsCost)),
      stock: intOrNull(formData.get("stock")),
      limitPerUser: Math.max(1, num(formData.get("limitPerUser"), reward.limitPerUser)),
      cooldownDays: Math.max(0, num(formData.get("cooldownDays"), reward.cooldownDays)),
      category: String(formData.get("category") ?? "").trim() || reward.category,
      fulfillmentType: (String(formData.get("fulfillmentType") ?? reward.fulfillmentType) as "VIRTUAL" | "PHYSICAL" | "OFFLINE"),
      images,
    },
  });

  revalidatePath("/rewards");
  revalidatePath("/admin/rewards");
  redirect("/rewards?ok=" + encodeURIComponent("已保存"));
}

export async function setRewardStatusAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { ctx } = await requireRewardEditor(id);
  const status = String(formData.get("status") ?? "");
  const allowed = ["ACTIVE", "PAUSED", "ARCHIVED", "DRAFT"];
  if (!allowed.includes(status)) redirect("/rewards");

  await prisma.reward.updateMany({
    where: { id, circleId: ctx.circle.id },
    data: {
      status: status as "ACTIVE" | "PAUSED" | "ARCHIVED" | "DRAFT",
      archivedAt: status === "ARCHIVED" ? new Date() : null,
    },
  });

  revalidatePath("/rewards");
  revalidatePath("/admin/rewards");
  redirect("/rewards?ok=" + encodeURIComponent(status === "ARCHIVED" ? "已归档" : "已更新"));
}
