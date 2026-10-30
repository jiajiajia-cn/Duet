import { prisma } from "./db";
import { shiftDate } from "./date";
import { isDueByDay, type Freq } from "./frequency";

export type AiConfig = {
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** 每晚几点之后算"新的一天"，默认 0 点 */
  hour?: number;
};

export function aiConfig(settings: unknown): AiConfig {
  const s = (settings ?? {}) as { ai?: AiConfig };
  const c = s.ai ?? {};
  return {
    enabled: Boolean(c.enabled && c.apiKey),
    apiKey: c.apiKey ?? "",
    baseUrl: (c.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, ""),
    model: c.model || "deepseek-chat",
    hour: typeof c.hour === "number" ? c.hour : 0,
  };
}

export type DayFacts = {
  nickname: string;
  date: string;
  weekday: string;
  done: { title: string; points: number; time: string | null }[];
  missed: { title: string }[];
  focusMinutes: number;
  focusBySkill: { name: string; minutes: number }[];
  earned: number;
  spent: number;
  weekRate: number;
  bestStreak: { title: string; days: number } | null;
  brokenStreaks: { title: string; days: number }[];
  recentRates: number[];
  redemptions: string[];
};

/** 把一天的原始数据整理成"给 AI 看的事实"，避免它瞎编 */
export async function collectFacts(opts: {
  circleId: string;
  userId: string;
  date: string;
  timezone: string;
}): Promise<DayFacts> {
  const { circleId, userId, date } = opts;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } });
  const habits = await prisma.habit.findMany({
    where: { circleId, status: { in: ["ACTIVE", "PAUSED"] }, OR: [{ ownerId: userId }, { collaborative: true }] },
  });

  const checkins = await prisma.checkin.findMany({
    where: { userId, localDate: date, status: "APPROVED" },
  });
  const byHabit = new Map(checkins.map((c) => [c.habitId, c]));

  const due = habits.filter((h) => isDueByDay(h.frequency as Freq, date));
  const done = due
    .filter((h) => byHabit.has(h.id))
    .map((h) => {
      const c = byHabit.get(h.id)!;
      return {
        title: h.title,
        points: c.pointsAwarded,
        time: new Date(c.checkedAt).toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: opts.timezone,
        }),
      };
    });
  const missed = due.filter((h) => !byHabit.has(h.id)).map((h) => ({ title: h.title }));

  const sessions = await prisma.timerSession.findMany({
    where: {
      userId,
      status: "COMPLETED",
      phase: "FOCUS",
      startedAt: { gte: new Date(`${date}T00:00:00+08:00`), lt: new Date(`${date}T23:59:59+08:00`) },
    },
    include: { skill: { select: { name: true } } },
  });

  const focusBySkillMap = new Map<string, number>();
  for (const s of sessions) {
    const key = s.skill?.name ?? "未分类";
    focusBySkillMap.set(key, (focusBySkillMap.get(key) ?? 0) + Math.round(s.elapsedSeconds / 60));
  }

  const txns = await prisma.pointTxn.findMany({
    where: {
      wallet: { circleId, userId },
      createdAt: { gte: new Date(`${date}T00:00:00+08:00`), lt: new Date(`${date}T23:59:59+08:00`) },
    },
  });
  let earned = 0;
  let spent = 0;
  for (const t of txns) {
    if (t.delta > 0) earned += t.delta;
    else spent += -t.delta;
  }

  const stats = await prisma.habitStat.findMany({ where: { userId } });
  const titleOf = new Map(habits.map((h) => [h.id, h.title]));
  const best = stats.sort((a, b) => b.currentStreak - a.currentStreak)[0];
  const broken = stats
    .filter((s) => s.lastDoneDate && s.lastDoneDate < shiftDate(date, -1) && s.currentStreak > 1)
    .slice(0, 3)
    .map((s) => ({ title: titleOf.get(s.habitId) ?? "某个习惯", days: s.currentStreak }));

  // 最近 7 天完成率
  const recentRates: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = shiftDate(date, -i);
    const dayHabits = habits.filter((h) => isDueByDay(h.frequency as Freq, d));
    if (!dayHabits.length) {
      recentRates.push(0);
      continue;
    }
    const doneCount = await prisma.checkin.count({
      where: { userId, localDate: d, status: "APPROVED", habitId: { in: dayHabits.map((h) => h.id) } },
    });
    recentRates.push(Math.round((doneCount / dayHabits.length) * 100));
  }

  const redemptions = (
    await prisma.redemption.findMany({
      where: {
        circleId,
        participants: { some: { userId } },
        createdAt: { gte: new Date(`${date}T00:00:00+08:00`), lt: new Date(`${date}T23:59:59+08:00`) },
      },
      include: { reward: { select: { title: true } } },
    })
  ).map((r) => r.reward.title);

  const WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  return {
    nickname: user?.nickname ?? "你",
    date,
    weekday: WD[new Date(`${date}T00:00:00Z`).getUTCDay()],
    done,
    missed,
    focusMinutes: sessions.reduce((s, x) => s + Math.round(x.elapsedSeconds / 60), 0),
    focusBySkill: Array.from(focusBySkillMap.entries()).map(([name, minutes]) => ({ name, minutes })),
    earned,
    spent,
    weekRate: Math.round(recentRates.slice(-7).reduce((a, b) => a + b, 0) / 7),
    bestStreak: best ? { title: titleOf.get(best.habitId) ?? "某个习惯", days: best.currentStreak } : null,
    brokenStreaks: broken,
    recentRates,
    redemptions,
  };
}

const SYSTEM_PROMPT = `你是一个很懂人的习惯教练，说话像一个了解对方的朋友，不是客服。
要求：
1. 必须基于给定的事实，不要编造没有的数据。
2. 先认可具体的进展（提到具体习惯名、时间、数字），再给 1 条具体可执行的建议。
3. 如果今天完成得少，不要指责，要共情 + 给一个很小的下一步。
4. 语气自然口语，不要用「首先/其次/总之」这类词，不要堆砌鼓励词。
5. 全文 150–220 字，分成 2–3 段，不要用列表。
6. 结尾可以有一句简短的鼓励或调侃，像 Duolingo 那样有点性格但不油腻。
7. 直接输出正文，不要加标题、不要 markdown 符号。`;

export function factsToPrompt(f: DayFacts): string {
  const lines = [
    `用户：${f.nickname}`,
    `日期：${f.date} ${f.weekday}`,
    `今天完成：${f.done.length} 项${f.done.length ? "（" + f.done.map((d) => `${d.time ?? ""} ${d.title} +${d.points}`).join("；") + "）" : ""}`,
    `今天没做：${f.missed.length ? f.missed.map((m) => m.title).join("、") : "无"}`,
    `专注：${f.focusMinutes} 分钟${f.focusBySkill.length ? "（" + f.focusBySkill.map((x) => `${x.name} ${x.minutes} 分钟`).join("、") + "）" : ""}`,
    `积分：获得 ${f.earned}，花掉 ${f.spent}`,
    f.redemptions.length ? `今天兑换：${f.redemptions.join("、")}` : "",
    `最近 7 天完成率：${f.recentRates.join("%、")}%`,
    f.bestStreak ? `最长在坚持：${f.bestStreak.title} 连续 ${f.bestStreak.days} 天` : "",
    f.brokenStreaks.length
      ? `最近断掉的连续：${f.brokenStreaks.map((b) => `${b.title}（断前 ${b.days} 天）`).join("、")}`
      : "",
  ].filter(Boolean);
  return lines.join("\n");
}

/** 调 DeepSeek（OpenAI 兼容接口） */
export async function callAi(cfg: AiConfig, prompt: string): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI 接口返回 ${res.status}：${text.slice(0, 120)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI 没有返回内容");
  return content;
}

/** 接口挂了也要给点东西，不能白屏 */
export function fallbackText(f: DayFacts): string {
  const head =
    f.done.length > 0
      ? `今天完成了 ${f.done.length} 项，${f.done.map((d) => d.title).join("、")}。`
      : "今天一项都没勾，没关系，日子本来就有快有慢。";
  const mid =
    f.focusMinutes > 0 ? `专注了 ${f.focusMinutes} 分钟。` : "";
  const tail =
    f.missed.length > 0
      ? `还剩 ${f.missed.length} 项没做，挑最容易的那件，五分钟也算数。`
      : "全做完了，早点休息。";
  return `${head}${mid}\n\n${tail}`;
}
