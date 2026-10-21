"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";

function parseBody(fd: FormData) {
  const title = String(fd.get("title") ?? "").trim().slice(0, 60);
  const date = String(fd.get("date") ?? "").trim();
  const allDay = fd.get("allDay") === "on";
  const startTime = String(fd.get("startTime") ?? "09:00");
  const endTime = String(fd.get("endTime") ?? "10:00");
  const category = String(fd.get("category") ?? "默认").trim().slice(0, 16) || "默认";
  const estimateMin = Math.trunc(Number(fd.get("estimateMin") ?? 0)) || null;

  const repKind = String(fd.get("repeatKind") ?? "none");
  const days = fd
    .getAll("repDays")
    .map((d) => Number(d))
    .filter((n) => n >= 1 && n <= 7);

  const startAt = allDay
    ? new Date(`${date}T00:00:00+08:00`)
    : new Date(`${date}T${startTime}:00+08:00`);
  const endAt = allDay
    ? new Date(`${date}T23:59:00+08:00`)
    : new Date(`${date}T${endTime}:00+08:00`);

  const rrule =
    repKind === "none"
      ? null
      : JSON.stringify({
          kind: repKind,
          ...(repKind === "weekly" ? { days: days.length ? days : [1] } : {}),
        });

  return {
    title,
    startAt,
    endAt,
    allDay,
    category,
    estimateMin,
    rrule,
    note: String(fd.get("note") ?? "").trim() || null,
  };
}

async function requireCtx() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function createEntryAction(fd: FormData) {
  const ctx = await requireCtx();
  const data = parseBody(fd);
  if (!data.title) redirect("/schedule/new?error=" + encodeURIComponent("写个标题"));
  if (!fd.get("date")) redirect("/schedule/new?error=" + encodeURIComponent("选个日期"));

  await prisma.entry.create({
    data: {
      ...data,
      userId: ctx.user.id,
      circleId: ctx.circle.id,
      timezone: ctx.user.timezone,
      kind: "EVENT",
    },
  });

  revalidatePath("/schedule");
  redirect("/schedule?ok=" + encodeURIComponent("已加上"));
}

export async function updateEntryAction(fd: FormData) {
  const ctx = await requireCtx();
  const id = String(fd.get("id") ?? "");
  const entry = await prisma.entry.findFirst({ where: { id, userId: ctx.user.id } });
  if (!entry) redirect("/schedule");

  const data = parseBody(fd);
  if (!data.title) redirect(`/schedule/${id}/edit?error=` + encodeURIComponent("写个标题"));

  await prisma.entry.update({ where: { id }, data });

  revalidatePath("/schedule");
  redirect("/schedule?ok=" + encodeURIComponent("已保存"));
}

export async function deleteEntryAction(fd: FormData) {
  const ctx = await requireCtx();
  const id = String(fd.get("id") ?? "");
  await prisma.entry.deleteMany({ where: { id, userId: ctx.user.id } });
  revalidatePath("/schedule");
  redirect("/schedule?ok=" + encodeURIComponent("已删除"));
}

export async function toggleEntryAction(fd: FormData) {
  const ctx = await requireCtx();
  const id = String(fd.get("id") ?? "");
  const entry = await prisma.entry.findFirst({ where: { id, userId: ctx.user.id } });
  if (!entry) redirect("/schedule");

  await prisma.entry.update({
    where: { id },
    data: entry.status === "DONE" ? { status: "PLANNED", completedAt: null } : { status: "DONE", completedAt: new Date() },
  });

  revalidatePath("/schedule");
  redirect("/schedule");
}
