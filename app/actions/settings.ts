"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";

function int(v: FormDataEntryValue | null, fallback = 0) {
  const n = Math.trunc(Number(String(v ?? "").trim()));
  return Number.isFinite(n) ? n : fallback;
}

function intOrNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Math.trunc(Number(s));
  return Number.isFinite(n) ? n : null;
}

/** 保存圈子的计时计分规则（阶梯 / 按分钟 / 按次） */
export async function saveCreditRuleAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") redirect("/timer");

  const mode = String(formData.get("mode") ?? "TIER") as "TIER" | "PER_MINUTE" | "PER_SESSION";

  const tiers: { minutes: number; points: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const minutes = intOrNull(formData.get(`tierMin_${i}`));
    const points = intOrNull(formData.get(`tierPts_${i}`));
    if (minutes != null && minutes > 0 && points != null && points >= 0) {
      tiers.push({ minutes, points });
    }
  }
  tiers.sort((a, b) => a.minutes - b.minutes);

  const data = {
    mode,
    tiers,
    minutesPerUnit: Math.max(1, int(formData.get("minutesPerUnit"), 10)),
    pointsPerUnit: Math.max(1, int(formData.get("pointsPerUnit"), 1)),
    pointsPerSession: Math.max(0, int(formData.get("pointsPerSession"), 10)),
    minMinutes: Math.max(0, int(formData.get("minMinutes"), 1)),
    capPerSession: intOrNull(formData.get("capPerSession")),
    capPerDay: intOrNull(formData.get("capPerDay")),
  };

  const existing = await prisma.creditRule.findFirst({
    where: { circleId: ctx.circle.id, scope: "CIRCLE" },
  });

  if (existing) {
    await prisma.creditRule.update({ where: { id: existing.id }, data });
  } else {
    await prisma.creditRule.create({
      data: { ...data, circleId: ctx.circle.id, scope: "CIRCLE" },
    });
  }

  revalidatePath("/timer");
  revalidatePath("/settings/credit");
  redirect("/settings/credit?ok=" + encodeURIComponent("已保存"));
}
