"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";

type Freq = { kind: string; days?: number[]; times?: number };

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

function parseFrequency(fd: FormData): Freq {
  const kind = String(fd.get("freqKind") ?? "daily");
  if (kind === "weekdays") {
    const days = fd
      .getAll("days")
      .map((d) => Number(d))
      .filter((n) => n >= 1 && n <= 7);
    return { kind, days: days.length ? Array.from(new Set(days)).sort() : [1, 2, 3, 4, 5] };
  }
  if (kind === "perWeek") {
    return { kind, times: Math.min(7, Math.max(1, int(fd.get("times"), 3))) };
  }
  return { kind: "daily" };
}

function parseHabit(fd: FormData) {
  const type = String(fd.get("type") ?? "CHECK") as "CHECK" | "QUANTITY" | "NEGATIVE" | "TIMED";
  const collaborative = fd.get("collaborative") === "on";
  return {
    title: String(fd.get("title") ?? "").trim().slice(0, 40),
    icon: String(fd.get("icon") ?? "✅").trim().slice(0, 4) || "✅",
    type,
    goalType: (String(fd.get("goalType") ?? "AT_LEAST") as "AT_LEAST" | "AT_MOST"),
    frequency: parseFrequency(fd) as object,
    unit: type === "QUANTITY" ? String(fd.get("unit") ?? "").trim().slice(0, 8) || "次" : null,
    countPerDay: type === "QUANTITY" ? Math.max(1, int(fd.get("countPerDay"), 1)) : 1,
    pointsPerCheckin: Math.max(0, int(fd.get("pointsPerCheckin"), 0)),
    pointsPerUnit: type === "QUANTITY" ? Math.max(0, int(fd.get("pointsPerUnit"), 0)) : 0,
    dailyCap: intOrNull(fd.get("dailyCap")),
    minTimerMinutes: type === "TIMED" ? Math.max(0, int(fd.get("minTimerMinutes"), 45)) : 0,
    autoCheckinOnTimer: type === "TIMED" && fd.get("autoCheckinOnTimer") === "on",
    defaultSkillId: String(fd.get("defaultSkillId") ?? "") || null,
    remindAt: String(fd.get("remindAt") ?? "") || null,
    collaborative,
    // 一起打卡本身就是互相监督，不再叠加"需要确认"
    needsReview: !collaborative && fd.get("needsReview") === "on",
  };
}

async function requireCtx() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function createHabitAction(fd: FormData) {
  const ctx = await requireCtx();
  const data = parseHabit(fd);
  if (!data.title) redirect("/habits/new?error=" + encodeURIComponent("名字不能为空"));

  const max = await prisma.habit.aggregate({
    where: { circleId: ctx.circle.id, ownerId: ctx.user.id },
    _max: { sortOrder: true },
  });

  const habit = await prisma.habit.create({
    data: {
      ...data,
      circleId: ctx.circle.id,
      ownerId: ctx.user.id,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });

  revalidatePath("/");
  revalidatePath("/habits");
  redirect(`/habits/${habit.id}/edit?ok=` + encodeURIComponent("已创建"));
}

export async function updateHabitAction(fd: FormData) {
  const ctx = await requireCtx();
  const id = String(fd.get("id") ?? "");
  const habit = await prisma.habit.findFirst({ where: { id, circleId: ctx.circle.id } });
  if (!habit || habit.ownerId !== ctx.user.id) redirect("/habits");

  const data = parseHabit(fd);
  if (!data.title) redirect(`/habits/${id}/edit?error=` + encodeURIComponent("名字不能为空"));

  await prisma.habit.update({ where: { id }, data });

  revalidatePath("/");
  revalidatePath("/habits");
  redirect(`/habits/${id}/edit?ok=` + encodeURIComponent("已保存"));
}

export async function setHabitStatusAction(fd: FormData) {
  const ctx = await requireCtx();
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "ACTIVE");
  if (!["ACTIVE", "PAUSED", "ARCHIVED"].includes(status)) redirect("/habits");

  await prisma.habit.updateMany({
    where: { id, circleId: ctx.circle.id, ownerId: ctx.user.id },
    data: {
      status: status as "ACTIVE" | "PAUSED" | "ARCHIVED",
      archivedAt: status === "ARCHIVED" ? new Date() : null,
    },
  });

  revalidatePath("/");
  revalidatePath("/habits");
  redirect("/habits?ok=" + encodeURIComponent(status === "ARCHIVED" ? "已归档" : "已更新"));
}
