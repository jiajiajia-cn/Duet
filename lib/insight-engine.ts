import { prisma } from "./db";
import type { Insight } from "./insights";

export type InsightKind = "correlation" | "drift" | "precursor" | "weekday" | "trend" | "focus";

export type Candidate = {
  kind: InsightKind;
  topicKey: string;
  text: string;
  /** 0–100，越高越值得说 */
  score: number;
  confidence: "low" | "medium" | "high";
  /** 可以立刻做什么 */
  action?: string;
};

export const KIND_LABEL: Record<InsightKind, string> = {
  correlation: "习惯之间的带动",
  drift: "时间漂移",
  precursor: "断签前兆",
  weekday: "星期规律",
  trend: "趋势",
  focus: "专注",
};

export const ALL_KINDS: InsightKind[] = ["correlation", "drift", "precursor", "weekday", "trend", "focus"];

/**
 * 把统计数据变成"候选洞察"。
 * 这里只判断"够不够格成为候选"，还不决定要不要给人看。
 */
export function detectInsights(i: Insight, enabled?: InsightKind[]): Candidate[] {
  const allow = (k: InsightKind) => !enabled || enabled.length === 0 || enabled.includes(k);
  const out: Candidate[] = [];

  // 同一对习惯只保留一条（A→B 和 B→A 是一回事）
  const seenPair = new Set<string>();
  for (const c of i.correlations ?? []) {
    if (!allow("correlation")) continue;
    const pairKey = [c.from, c.to].sort().join("|");
    if (seenPair.has(pairKey)) continue;
    seenPair.add(pairKey);
    const lift = c.withA - c.withoutA;
    // 样本越多越可信，效果越大越值得说
    const score = Math.min(100, 35 + lift * 0.8 + Math.min(c.samples, 20));
    out.push({
      kind: "correlation",
      topicKey: `corr:${c.from}:${c.to}`,
      text: `做「${c.from}」的那天，「${c.to}」完成率 ${c.withA}%；没做时只有 ${c.withoutA}%`,
      score,
      confidence: c.samples >= 18 ? "high" : c.samples >= 10 ? "medium" : "low",
      action: `明天先做「${c.from}」，它像是「${c.to}」的开关。`,
    });
  }

  for (const d of i.drift ?? []) {
    if (!allow("drift")) continue;
    const score = Math.min(100, 55 + d.shift / 6 + d.days * 2);
    out.push({
      kind: "drift",
      topicKey: `drift:${d.title}`,
      text: `「${d.title}」最近 ${d.days} 次从 ${d.from} 一路滑到 ${d.to}`,
      score,
      confidence: d.days >= 7 ? "high" : "medium",
      action: `把「${d.title}」挪回 ${d.from}，或者干脆固定在${d.from}前做完。`,
    });
  }

  if (i.precursor && i.precursor.lateBefore >= 1 && allow("precursor")) {
    const p = i.precursor;
    const ratio = p.lateBefore / Math.max(1, p.breaks);
    const score = Math.min(100, 50 + ratio * 40 + p.breaks * 3);
    out.push({
      kind: "precursor",
      topicKey: "precursor:any",
      text: `过去 ${p.breaks} 次断签里，有 ${p.lateBefore} 次前一天打卡比平时晚了 ${p.lateMinutes} 分钟以上`,
      score,
      confidence: p.breaks >= 3 && ratio >= 0.6 ? "high" : "medium",
      action: "哪天拖到很晚，第二天就先把最容易的那件做掉，别等它断。",
    });
  }

  if (i.bestDay && i.worstDay && allow("weekday")) {
    const gap = i.bestDay.rate - i.worstDay.rate;
    if (gap >= 25) {
      out.push({
        kind: "weekday",
        topicKey: `weekday:${i.worstDay.label}`,
        text: `${i.bestDay.label}最稳（${i.bestDay.rate}%），${i.worstDay.label}最容易崩（${i.worstDay.rate}%）`,
        score: Math.min(100, 30 + gap * 0.6),
        confidence: "medium",
        action: `${i.worstDay.label}把任务砍一半，只留最关键的一件。`,
      });
    }
  }

  if (allow("trend") && Math.abs(i.trend.diff) >= 15) {
    const up = i.trend.diff > 0;
    out.push({
      kind: "trend",
      topicKey: "trend:week",
      text: `本周完成率 ${i.trend.thisWeek}%，比上周${up ? "高" : "低"} ${Math.abs(i.trend.diff)} 个百分点`,
      score: Math.min(100, 32 + Math.abs(i.trend.diff) * 0.7),
      confidence: "medium",
      action: up ? "趁状态好，把最难的那件安排在这周。" : "先别加新习惯，守住现有的就行。",
    });
  }

  if (allow("focus") && i.focusMinutes >= 120 && i.topSkill) {
    const share = Math.round((i.topSkill.minutes / i.focusMinutes) * 100);
    if (share >= 60) {
      out.push({
        kind: "focus",
        topicKey: `focus:${i.topSkill.name}`,
        text: `专注时间有 ${share}% 花在「${i.topSkill.name}」上（${i.topSkill.minutes} 分钟）`,
        score: 40 + share * 0.3,
        confidence: "medium",
      });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}

export type Surface = "page" | "weekly" | "daily" | "today";

const SURFACE_RULE: Record<Surface, { min: number; max: number; cooldownDays: number }> = {
  // 洞察页：全都摊开给人看，只要过线
  page: { min: 55, max: 6, cooldownDays: 0 },
  // 周报：2–3 条，重复没关系
  weekly: { min: 50, max: 3, cooldownDays: 0 },
  // 日报：最多 1 条，7 天内说过就不再提
  daily: { min: 60, max: 1, cooldownDays: 7 },
  // 今日页：最多 1 条，3 天内不重复，只挑能立刻行动的
  today: { min: 65, max: 1, cooldownDays: 3 },
};

/** 取最近 N 天展示过的 topicKey */
export async function recentlyShown(userId: string, days: number): Promise<Set<string>> {
  if (days <= 0) return new Set();
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await prisma.insightSeen
    .findMany({ where: { userId, shownAt: { gte: since } }, select: { topicKey: true } })
    .catch(() => []);
  return new Set(rows.map((r) => r.topicKey));
}

/**
 * 决定这次到底给哪几条。
 * 关键：如果都不够格，就返回空数组 —— 宁可不说。
 */
export function pickForSurface(
  all: Candidate[],
  surface: Surface,
  shown: Set<string> = new Set(),
): Candidate[] {
  const rule = SURFACE_RULE[surface];
  return all
    .filter((c) => c.score >= rule.min)
    .filter((c) => (rule.cooldownDays > 0 ? !shown.has(c.topicKey) : true))
    .slice(0, rule.max);
}

/** 记下"已经给用户看过"，用于冷却 */
export async function markShown(userId: string, items: Candidate[]) {
  if (!items.length) return;
  await Promise.all(
    items.map((c) =>
      prisma.insightSeen
        .upsert({
          where: { userId_topicKey: { userId, topicKey: c.topicKey } },
          create: { userId, topicKey: c.topicKey },
          update: { shownAt: new Date() },
        })
        .catch(() => null),
    ),
  );
}

/** 给 AI 的提示：只给挑出来的这几条 */
export function pickedToText(items: Candidate[]): string {
  if (!items.length) return "这次没有足够可靠的规律可说，不要硬编洞察。";
  return items.map((c) => `- ${c.text}${c.action ? ` → ${c.action}` : ""}`).join("\n");
}
