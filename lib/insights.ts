import { prisma } from "./db";
import { shiftDate } from "./date";
import { isDueByDay, type Freq } from "./frequency";

const WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export type Insight = {
  range: { start: string; end: string; days: number };
  overallRate: number;
  byWeekday: { wd: number; label: string; rate: number; due: number }[];
  bestDay: { label: string; rate: number } | null;
  worstDay: { label: string; rate: number } | null;
  trend: { thisWeek: number; lastWeek: number; diff: number };
  fragile: { title: string; missed: number; rate: number }[];
  strongest: { title: string; rate: number }[];
  avgHour: number | null;
  timeBucket: { label: string; count: number }[];
  lateHabits: { title: string; rate: number }[];
  topSkill: { name: string; minutes: number } | null;
  longest: { title: string; days: number } | null;
  focusMinutes: number;
};

/**
 * 纯统计出来的规律，不调 AI。
 * 这些都是可以复算的硬事实，AI 只负责解读。
 */
export async function computeInsights(opts: {
  circleId: string;
  userId: string;
  today: string;
  timezone: string;
  days?: number;
}): Promise<Insight> {
  const days = opts.days ?? 30;
  const start = shiftDate(opts.today, -(days - 1));

  const habits = await prisma.habit.findMany({
    where: {
      circleId: opts.circleId,
      status: { in: ["ACTIVE", "PAUSED", "ARCHIVED"] },
      OR: [{ ownerId: opts.userId }, { collaborative: true }],
    },
  });

  const checkins = await prisma.checkin.findMany({
    where: {
      userId: opts.userId,
      localDate: { gte: start, lte: opts.today },
      status: "APPROVED",
    },
  });

  const byDate = new Map<string, Set<string>>();
  const byHabit = new Map<string, number>();
  const hourBuckets = [0, 0, 0, 0]; // 早 5-11 / 午 11-17 / 晚 17-23 / 深夜 23-5
  let hourSum = 0;
  let hourCount = 0;

  for (const c of checkins) {
    if (!byDate.has(c.localDate)) byDate.set(c.localDate, new Set());
    byDate.get(c.localDate)!.add(c.habitId);
    byHabit.set(c.habitId, (byHabit.get(c.habitId) ?? 0) + 1);

    const h = Number(
      new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: opts.timezone }).format(
        new Date(c.checkedAt),
      ),
    );
    hourSum += h;
    hourCount++;
    if (h >= 5 && h < 11) hourBuckets[0]++;
    else if (h >= 11 && h < 17) hourBuckets[1]++;
    else if (h >= 17 && h < 23) hourBuckets[2]++;
    else hourBuckets[3]++;
  }

  // 按星期几
  const wdDue = new Array(7).fill(0);
  const wdDone = new Array(7).fill(0);
  const habitDue = new Map<string, number>();
  let totalDue = 0;
  let totalDone = 0;

  for (let i = 0; i < days; i++) {
    const date = shiftDate(start, i);
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
    const doneSet = byDate.get(date) ?? new Set<string>();
    for (const h of habits) {
      if (h.status === "ARCHIVED" && h.archivedAt) {
        const arch = new Date(h.archivedAt).toISOString().slice(0, 10);
        if (arch < date) continue;
      }
      if (!isDueByDay(h.frequency as Freq, date)) continue;
      wdDue[wd]++;
      habitDue.set(h.id, (habitDue.get(h.id) ?? 0) + 1);
      totalDue++;
      if (doneSet.has(h.id)) {
        wdDone[wd]++;
        totalDone++;
      }
    }
  }

  const byWeekday = [1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const due = wdDue[wd];
    const done = wdDone[wd];
    return { wd, label: WD[wd], rate: due ? Math.round((done / due) * 100) : 0, due };
  });

  const valid = byWeekday.filter((d) => d.due >= 3);
  const bestDay = valid.length ? valid.reduce((a, b) => (b.rate > a.rate ? b : a)) : null;
  const worstDay = valid.length ? valid.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;

  // 近 7 天 vs 上一个 7 天
  const rateOf = (from: string, to: string) => {
    let due = 0;
    let done = 0;
    for (let d = from; d <= to; d = shiftDate(d, 1)) {
      const doneSet = byDate.get(d) ?? new Set<string>();
      for (const h of habits) {
        if (!isDueByDay(h.frequency as Freq, d)) continue;
        due++;
        if (doneSet.has(h.id)) done++;
      }
    }
    return due ? Math.round((done / due) * 100) : 0;
  };
  const thisWeek = rateOf(shiftDate(opts.today, -6), opts.today);
  const lastWeek = rateOf(shiftDate(opts.today, -13), shiftDate(opts.today, -7));

  // 最容易断的习惯
  const fragile = habits
    .filter((h) => (habitDue.get(h.id) ?? 0) >= 5)
    .map((h) => {
      const due = habitDue.get(h.id) ?? 0;
      const done = byHabit.get(h.id) ?? 0;
      return { title: h.title, missed: due - done, rate: Math.round((done / due) * 100) };
    })
    .filter((x) => x.rate < 90)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 3);

  const strongest = habits
    .filter((h) => (habitDue.get(h.id) ?? 0) >= 5)
    .map((h) => {
      const due = habitDue.get(h.id) ?? 0;
      const done = byHabit.get(h.id) ?? 0;
      return { title: h.title, rate: Math.round((done / due) * 100) };
    })
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3);

  // 晚上打的卡，完成率是不是更低？（同一批习惯里比较早晚差异）
  const lateHabits = (() => {
    const evening = new Set<string>();
    for (const c of checkins) {
      const h = Number(
        new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: opts.timezone }).format(
          new Date(c.checkedAt),
        ),
      );
      if (h >= 21 || h < 3) evening.add(c.habitId);
    }
    return fragile
      .filter((f) => evening.has(habits.find((h) => h.title === f.title)?.id ?? ""))
      .map((f) => ({ title: f.title, rate: f.rate }));
  })();

  const skills = await prisma.timerSession.groupBy({
    by: ["skillId"],
    where: {
      userId: opts.userId,
      status: "COMPLETED",
      phase: "FOCUS",
      startedAt: { gte: new Date(`${start}T00:00:00+08:00`) },
    },
    _sum: { elapsedSeconds: true },
  });
  const skillNames = await prisma.skill.findMany({
    where: { id: { in: skills.map((s) => s.skillId!).filter(Boolean) } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(skillNames.map((s) => [s.id, s.name]));
  const skillTop = skills
    .map((s) => ({ name: s.skillId ? (nameOf.get(s.skillId) ?? "未分类") : "未分类", minutes: Math.round((s._sum.elapsedSeconds ?? 0) / 60) }))
    .sort((a, b) => b.minutes - a.minutes)[0] ?? null;

  const focusMinutes = skills.reduce((sum, s) => sum + Math.round((s._sum.elapsedSeconds ?? 0) / 60), 0);

  const stats = await prisma.habitStat.findMany({ where: { userId: opts.userId } });
  const titleOf = new Map(habits.map((h) => [h.id, h.title]));
  const longest = stats
    .map((s) => ({ title: titleOf.get(s.habitId) ?? "某个习惯", days: s.bestStreak }))
    .sort((a, b) => b.days - a.days)[0] ?? null;

  return {
    range: { start, end: opts.today, days },
    overallRate: totalDue ? Math.round((totalDone / totalDue) * 100) : 0,
    byWeekday,
    bestDay: bestDay ? { label: bestDay.label, rate: bestDay.rate } : null,
    worstDay: worstDay ? { label: worstDay.label, rate: worstDay.rate } : null,
    trend: { thisWeek, lastWeek, diff: thisWeek - lastWeek },
    fragile,
    strongest,
    avgHour: hourCount ? Math.round(hourSum / hourCount) : null,
    timeBucket: [
      { label: "早上 5–11 点", count: hourBuckets[0] },
      { label: "中午 11–17 点", count: hourBuckets[1] },
      { label: "晚上 17–23 点", count: hourBuckets[2] },
      { label: "深夜 23–5 点", count: hourBuckets[3] },
    ],
    lateHabits,
    topSkill: skillTop,
    longest,
    focusMinutes,
  };
}

/** 给 AI 看的洞察文本 */
export function insightsToText(i: Insight): string {
  const lines = [
    `统计范围：最近 ${i.range.days} 天（${i.range.start} ~ ${i.range.end}）`,
    `总体完成率：${i.overallRate}%`,
    i.bestDay ? `完成率最高的是${i.bestDay.label}（${i.bestDay.rate}%）` : "",
    i.worstDay && i.worstDay.label !== i.bestDay?.label ? `最低的是${i.worstDay.label}（${i.worstDay.rate}%）` : "",
    `本周 ${i.trend.thisWeek}%，上周 ${i.trend.lastWeek}%（${i.trend.diff >= 0 ? "上升" : "下降"} ${Math.abs(i.trend.diff)} 个百分点）`,
    i.fragile.length ? `最容易断：${i.fragile.map((f) => `${f.title}（完成率 ${f.rate}%）`).join("、")}` : "",
    i.strongest.length ? `最稳定：${i.strongest.map((f) => `${f.title}（${f.rate}%）`).join("、")}` : "",
    i.avgHour != null ? `平均打卡时间：${i.avgHour} 点` : "",
    `打卡时段分布：${i.timeBucket.map((t) => `${t.label} ${t.count} 次`).join("，")}`,
    i.lateHabits.length ? `深夜才打卡的习惯：${i.lateHabits.map((x) => x.title).join("、")}` : "",
    i.focusMinutes ? `专注总时长 ${i.focusMinutes} 分钟${i.topSkill ? `，最多的是 ${i.topSkill.name}（${i.topSkill.minutes} 分钟）` : ""}` : "",
    i.longest ? `最长连续纪录：${i.longest.title} ${i.longest.days} 天` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
