"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { localDateString, shiftDate } from "@/lib/date";
import { aiConfig, callAi, collectFacts, factsToPrompt, fallbackText, type AiConfig } from "@/lib/ai";

async function requireCtx() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** 圈主保存 AI 配置 */
export async function saveAiConfigAction(fd: FormData) {
  const ctx = await requireCtx();
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    redirect("/settings?error=" + encodeURIComponent("只有圈主能设置 AI"));
  }

  const settings = (ctx.circle.settings ?? {}) as Record<string, unknown>;
  const prev = (settings.ai ?? {}) as AiConfig;

  const apiKey = String(fd.get("apiKey") ?? "").trim();
  const baseUrl = String(fd.get("baseUrl") ?? "").trim() || "https://api.deepseek.com/v1";
  const model = String(fd.get("model") ?? "").trim() || "deepseek-chat";
  const enabled = fd.get("enabled") === "on";
  const hour = Math.min(6, Math.max(0, Number(fd.get("hour") ?? 0) || 0));

  await prisma.circle.update({
    where: { id: ctx.circle.id },
    data: {
      settings: {
        ...settings,
        ai: {
          // 留空表示不修改已保存的 key
          apiKey: apiKey || prev.apiKey || "",
          baseUrl,
          model,
          enabled,
          hour,
        },
      },
    },
  });

  revalidatePath("/settings/ai");
  redirect("/settings/ai?ok=" + encodeURIComponent("已保存"));
}

/** 测试一下 key 是否可用 */
export async function testAiAction() {
  const ctx = await requireCtx();
  const cfg = aiConfig(ctx.circle.settings);
  if (!cfg.apiKey) redirect("/settings/ai?error=" + encodeURIComponent("还没有填 API Key"));

  let result = "";
  try {
    result = await callAi(cfg, "用一句话夸夸一个今天完成了 2 个习惯的人，20 字以内。");
  } catch (e) {
    redirect("/settings/ai?error=" + encodeURIComponent((e as Error).message));
  }

  redirect("/settings/ai?ok=" + encodeURIComponent(`连接正常：${result.slice(0, 60)}`));
}

/** 生成某天的日报（已存在就直接返回） */
export async function ensureDailyReport(opts?: { force?: boolean }) {
  const ctx = await requireCtx();
  const cfg = aiConfig(ctx.circle.settings);
  if (!cfg.enabled) return { ok: false as const, reason: "disabled" as const };

  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
  const date = today;

  const existing = await prisma.aiReport.findUnique({
    where: { userId_kind_date: { userId: ctx.user.id, kind: "DAILY", date } },
  });
  if (existing && !opts?.force) return { ok: true as const, id: existing.id };

  const facts = await collectFacts({
    circleId: ctx.circle.id,
    userId: ctx.user.id,
    date,
    timezone: ctx.user.timezone,
  });

  let content = "";
  let model = cfg.model ?? "deepseek-chat";
  try {
    content = await callAi(cfg, factsToPrompt(facts));
  } catch (e) {
    content = fallbackText(facts);
    model = "fallback";
  }

  const saved = await prisma.aiReport.upsert({
    where: { userId_kind_date: { userId: ctx.user.id, kind: "DAILY", date } },
    create: { circleId: ctx.circle.id, userId: ctx.user.id, kind: "DAILY", date, content, model },
    update: { content, model, readAt: null },
  });

  revalidatePath("/ai");
  return { ok: true as const, id: saved.id };
}

/** 页面挂载时取：今天有没有未读的日报（没有就顺手生成） */
export async function fetchUnreadReport() {
  const ctx = await getContext();
  if (!ctx) return null;

  const cfg = aiConfig(ctx.circle.settings);
  if (!cfg.enabled) return null;

  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
  const nowHour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: ctx.user.timezone }).format(new Date()),
  );
  // 只在设定的时间之后才生成，避免白天频繁触发
  if (nowHour < (cfg.hour ?? 0)) return null;

  let report = await prisma.aiReport.findUnique({
    where: { userId_kind_date: { userId: ctx.user.id, kind: "DAILY", date: today } },
  });

  if (!report) {
    const r = await ensureDailyReport().catch(() => null);
    if (!r || !r.ok) return null;
    report = await prisma.aiReport.findUnique({
      where: { userId_kind_date: { userId: ctx.user.id, kind: "DAILY", date: today } },
    });
  }

  if (!report || report.readAt) return null;

  return {
    id: report.id,
    date: report.date,
    content: report.content,
    model: report.model,
  };
}

export async function markReportReadAction(fd: FormData) {
  const ctx = await requireCtx();
  const id = String(fd.get("id") ?? "");
  await prisma.aiReport.updateMany({
    where: { id, userId: ctx.user.id },
    data: { readAt: new Date() },
  });
  revalidatePath("/ai");
  return { ok: true };
}

/** 手动重新生成（设置页用） */
export async function regenerateAction() {
  const ctx = await requireCtx();
  const cfg = aiConfig(ctx.circle.settings);
  if (!cfg.enabled) redirect("/settings/ai?error=" + encodeURIComponent("先打开开关并填 Key"));

  const r = await ensureDailyReport({ force: true }).catch(() => null);
  if (!r || !r.ok) redirect("/settings/ai?error=" + encodeURIComponent("生成失败，检查 Key 和网络"));
  redirect("/ai?ok=" + encodeURIComponent("已重新生成今天的回顾"));
}

/** 周报：最近 7 天的汇总 */
export async function generateWeeklyAction() {
  const ctx = await requireCtx();
  const cfg = aiConfig(ctx.circle.settings);
  if (!cfg.enabled) redirect("/ai?error=" + encodeURIComponent("AI 还没开启"));

  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
  const start = shiftDate(today, -6);

  const reports = await prisma.aiReport.findMany({
    where: { userId: ctx.user.id, kind: "DAILY", date: { gte: start, lte: today } },
    orderBy: { date: "asc" },
  });

  const factsText = reports.length
    ? reports.map((r) => `【${r.date}】\n${r.content}`).join("\n\n")
    : "这一周没有日报记录。";

  let content = "";
  let model = cfg.model ?? "deepseek-chat";
  try {
    content = await callAi(
      cfg,
      `下面是这个人最近 7 天的每日回顾，请写一段本周总结（120–180 字，2 段，口语化，指出一个规律 + 一个下周建议，不要罗列）：\n\n${factsText}`,
    );
  } catch {
    content = "这周的数据还不够，多记录几天，我就能看出你的规律了。";
    model = "fallback";
  }

  await prisma.aiReport.upsert({
    where: { userId_kind_date: { userId: ctx.user.id, kind: "WEEKLY", date: today } },
    create: { circleId: ctx.circle.id, userId: ctx.user.id, kind: "WEEKLY", date: today, content, model },
    update: { content, model, readAt: null },
  });

  redirect("/ai?ok=" + encodeURIComponent("周报生成好了"));
}
