"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { localDateString, shiftDate } from "@/lib/date";
import { aiConfig, callAi, collectFacts, factsToPrompt, fallbackText, type AiConfig } from "@/lib/ai";
import { computeInsights, insightsToText } from "@/lib/insights";
import {
  detectInsights,
  markShown,
  pickForSurface,
  pickedToText,
  recentlyShown,
  type InsightKind,
} from "@/lib/insight-engine";

/** 圈主在设置里勾选启用的洞察类型 */
function enabledKinds(settings: unknown): InsightKind[] {
  const s = (settings ?? {}) as { ai?: { kinds?: InsightKind[] } };
  return s.ai?.kinds ?? [];
}

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
  const persona = String(fd.get("persona") ?? prev.persona ?? "coach");
  const kinds = fd.getAll("kinds").map(String);

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
          persona,
          kinds,
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

/** 正在生成中的占位标记 */
const PENDING = "pending";
const PENDING_TTL_MS = 3 * 60 * 1000;

/** 生成某天的日报（已存在就直接返回） */
export async function ensureDailyReport(opts?: { force?: boolean }) {
  const ctx = await requireCtx();
  const cfg = aiConfig(ctx.circle.settings);
  if (!cfg.enabled) return { ok: false as const, reason: "disabled" as const };

  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
  // 0 点之后生成的是「刚刚结束的那一天」，不是新的这天
  const date = shiftDate(today, -1);
  const where = { userId_kind_date: { userId: ctx.user.id, kind: "DAILY" as const, date } };

  const existing = await prisma.aiReport.findUnique({ where });

  if (existing && !opts?.force) {
    // 已经有真内容了，直接用
    if (existing.content && existing.model !== PENDING) return { ok: true as const, id: existing.id };
    // 别人正在生成；超过 3 分钟视为卡死，允许接管
    const age = Date.now() - new Date(existing.createdAt).getTime();
    if (age < PENDING_TTL_MS) return { ok: false as const, reason: "pending" as const };
  }

  // 抢一个"生成中"的占位，避免多个页面同时触发调用 AI（会被限流，进而退化成 fallback）
  if (!existing) {
    try {
      await prisma.aiReport.create({
        data: { circleId: ctx.circle.id, userId: ctx.user.id, kind: "DAILY", date, content: "", model: PENDING },
      });
    } catch {
      const again = await prisma.aiReport.findUnique({ where });
      if (again?.content && again.model !== PENDING) return { ok: true as const, id: again.id };
      return { ok: false as const, reason: "pending" as const };
    }
  }

  const facts = await collectFacts({
    circleId: ctx.circle.id,
    userId: ctx.user.id,
    date,
    timezone: ctx.user.timezone,
  });

  // 只挑一条最值得说的洞察，7 天内说过的不再重复
  const insightsData = await computeInsights({
    circleId: ctx.circle.id,
    userId: ctx.user.id,
    today: date,
    timezone: ctx.user.timezone,
    days: 30,
    joinedAt: ctx.user.createdAt,
  }).catch(() => null);
  const shown = await recentlyShown(ctx.user.id, 7);
  const picked = insightsData
    ? pickForSurface(detectInsights(insightsData, enabledKinds(ctx.circle.settings)), "daily", shown)
    : [];

  const prompt = `${factsToPrompt(facts)}

【这次可以说的规律（只能从这里选，也可以不提）】
${pickedToText(picked)}

如果上面给了规律，就用一句话把它讲透，再顺着它给建议；如果写的是"没有足够可靠的规律"，就只聊今天，不要编规律。`;

  let content = "";
  let model = cfg.model ?? "deepseek-chat";
  let lastError = "";

  // 网络抖动/限流重试一次，别一次失败就退化成简版
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      content = await callAi(cfg, prompt);
      break;
    } catch (e) {
      lastError = (e as Error).message;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
    }
  }

  if (!content) {
    content = fallbackText(facts);
    model = "fallback";
  }

  // 关键：已经有真实内容时，不要用简版把它覆盖掉
  const prev = await prisma.aiReport.findUnique({ where });
  if (
    model === "fallback" &&
    prev?.content &&
    prev.model &&
    prev.model !== "fallback" &&
    prev.model !== PENDING
  ) {
    return { ok: true as const, id: prev.id };
  }

  const saved = await prisma.aiReport.upsert({
    where,
    create: { circleId: ctx.circle.id, userId: ctx.user.id, kind: "DAILY", date, content, model },
    update: { content, model, readAt: null },
  });

  // 失败原因记在返回里，方便前端/日志排查
  if (model === "fallback") console.warn("[ai] 生成失败，已用简版：", lastError);

  revalidatePath("/ai");
  return { ok: true as const, id: saved.id, fallback: model === "fallback", error: lastError };
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

  // 报告的是昨天（刚刚结束的那天）
  const reportDate = shiftDate(today, -1);

  let report = await prisma.aiReport.findUnique({
    where: { userId_kind_date: { userId: ctx.user.id, kind: "DAILY", date: reportDate } },
  });

  if (!report) {
    const r = await ensureDailyReport().catch(() => null);
    if (!r || !r.ok) return null;
    report = await prisma.aiReport.findUnique({
      where: { userId_kind_date: { userId: ctx.user.id, kind: "DAILY", date: reportDate } },
    });
  }

  // 正在生成中或内容为空，先不弹
  if (!report || report.readAt) return null;
  if (!report.content || report.model === PENDING) return null;

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

/** 删掉一篇回顾 */
export async function deleteReportAction(fd: FormData) {
  const ctx = await requireCtx();
  const id = String(fd.get("id") ?? "");
  await prisma.aiReport.deleteMany({ where: { id, userId: ctx.user.id } });
  revalidatePath("/ai");
}

/** 清空我的全部回顾 */
export async function clearAllReportsAction() {
  const ctx = await requireCtx();
  await prisma.aiReport.deleteMany({ where: { userId: ctx.user.id } });
  revalidatePath("/ai");
  redirect("/ai?ok=" + encodeURIComponent("已清空"));
}

/** 手动重新生成（设置页用） */
export async function regenerateAction() {
  const ctx = await requireCtx();
  const cfg = aiConfig(ctx.circle.settings);
  if (!cfg.enabled) redirect("/settings/ai?error=" + encodeURIComponent("先打开开关并填 Key"));

  const r = await ensureDailyReport({ force: true }).catch(() => null);
  if (!r || !r.ok) {
    redirect("/settings/ai?error=" + encodeURIComponent(r && "reason" in r && r.reason === "pending" ? "正在生成中，稍等一下" : "生成失败，检查 Key 和网络"));
  }
  if (r.fallback) {
    // 把真实原因抛给用户，不然只能干瞪眼
    redirect("/settings/ai?error=" + encodeURIComponent(`AI 调用失败：${r.error || "未知错误"}`));
  }
  redirect("/ai?ok=" + encodeURIComponent("已重新生成"));
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

  const insight = await computeInsights({
    circleId: ctx.circle.id,
    userId: ctx.user.id,
    today,
    timezone: ctx.user.timezone,
    days: 30,
    joinedAt: ctx.user.createdAt,
  });

  const weeklyPicked = pickForSurface(
    detectInsights(insight, enabledKinds(ctx.circle.settings)),
    "weekly",
  );

  let content = "";
  let model = cfg.model ?? "deepseek-chat";
  try {
    content = await callAi(
      cfg,
      `请写一段本周总结（160–240 字，2–3 段，口语化，不要罗列清单）。

【必须做的事】
1. 从下面的统计里找出 1–2 个真实的规律（比如哪一天最容易崩、哪个习惯在拖后腿、打卡时间越来越晚、本周比上周进步/退步），
   用具体数字说清楚，不要泛泛而谈。
2. 基于这个规律给一个下周的调整方案，要具体到"怎么做"，不是"要坚持"。
3. 最后一句给一个最小行动。

【这次可以说的规律（只能从这里选）】
${pickedToText(weeklyPicked)}

【统计】
${insightsToText(insight)}

【每日回顾】
${factsText}`,
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
