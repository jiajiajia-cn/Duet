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
  /** 跨习惯关联：A 做成的那天 B 更容易完成 */
  correlations: { from: string; to: string; withA: number; withoutA: number; samples: number }[];
  /** 时间漂移：连续几天越来越晚 */
  drift: { title: string; from: string; to: string; days: number; shift: number }[];
  /** 断签前兆 */
  precursor: { breaks: number; lateBefore: number; lateMinutes: number } | null;
};

function minutesOfDay(d: Date, tz: string): number {
  const s = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(d);
  const [h, m] = s.split(":");
  return Number(h) * 60 + Number(m);
}

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = Math.round(m % 60);
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

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
  /** 注册时间：注册之前的数据不算，否则完成率会被拉低 */
  joinedAt?: Date;
}): Promise<Insight> {
  const days = opts.days ?? 30;
  const requestedStart = shiftDate(opts.today, -(days - 1));
  const joinedDate = opts.joinedAt
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: opts.timezone ?? "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(opts.joinedAt)
    : requestedStart;
  const start = joinedDate > requestedStart ? joinedDate : requestedStart;

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
      // 习惯建出来之前，不该算进"该做"
      const created = new Date(h.createdAt);
      const createdDate = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
      if (date < createdDate) continue;
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
        if (d < start) continue;
        const cd = new Date(h.createdAt);
        const cdate = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}-${String(cd.getDate()).padStart(2, "0")}`;
        if (d < cdate) continue;
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

  // ---------- 三块深度分析 ----------

  // 每个习惯的打卡日期集合 + 时间序列
  const doneDates = new Map<string, Set<string>>();
  const timeSeries = new Map<string, { date: string; min: number }[]>();
  for (const c of checkins) {
    if (!doneDates.has(c.habitId)) doneDates.set(c.habitId, new Set());
    doneDates.get(c.habitId)!.add(c.localDate);
    if (!timeSeries.has(c.habitId)) timeSeries.set(c.habitId, []);
    timeSeries.get(c.habitId)!.push({ date: c.localDate, min: minutesOfDay(new Date(c.checkedAt), opts.timezone) });
  }
  for (const list of timeSeries.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  // ① 跨习惯关联：只在"两个习惯那天都该做"的日子里比较
  const dateList: string[] = [];
  for (let i = 0; i < days; i++) dateList.push(shiftDate(start, i));

  const active = habits.filter((h) => (habitDue.get(h.id) ?? 0) >= 5);
  const correlations: Insight["correlations"] = [];
  for (const a of active) {
    const aDates = doneDates.get(a.id) ?? new Set<string>();
    for (const b of active) {
      if (a.id === b.id) continue;
      const bDates = doneDates.get(b.id) ?? new Set<string>();

      let withA = 0, withADone = 0, withoutA = 0, withoutADone = 0;
      for (const d of dateList) {
        if (!isDueByDay(a.frequency as Freq, d) || !isDueByDay(b.frequency as Freq, d)) continue;
        if (aDates.has(d)) {
          withA++;
          if (bDates.has(d)) withADone++;
        } else {
          withoutA++;
          if (bDates.has(d)) withoutADone++;
        }
      }

      // 样本太少不算，避免巧合
      if (withA < 4 || withoutA < 4) continue;
      const rateWith = Math.round((withADone / withA) * 100);
      const rateWithout = Math.round((withoutADone / withoutA) * 100);
      const lift = rateWith - rateWithout;
      if (lift < 20) continue;

      correlations.push({
        from: a.title,
        to: b.title,
        withA: rateWith,
        withoutA: rateWithout,
        samples: withA + withoutA,
      });
    }
  }
  correlations.sort((x, y) => (y.withA - y.withoutA) - (x.withA - x.withoutA));

  // ② 时间漂移：最近几次是不是越来越晚
  const drift: Insight["drift"] = [];
  for (const h of active) {
    const series = (timeSeries.get(h.id) ?? []).slice(-8);
    if (series.length < 5) continue;

    const first = series[0];
    const last = series[series.length - 1];
    const shift = last.min - first.min;
    if (shift < 40) continue;

    let ups = 0;
    for (let i = 1; i < series.length; i++) if (series[i].min > series[i - 1].min) ups++;
    if (ups < Math.ceil((series.length - 1) * 0.7)) continue;

    drift.push({
      title: h.title,
      from: fmtMinutes(first.min),
      to: fmtMinutes(last.min),
      days: series.length,
      shift,
    });
  }
  drift.sort((a, b) => b.shift - a.shift);

  // ③ 断签前兆：断掉那次的前一天，是不是比平时晚很多
  let breaks = 0;
  let lateBefore = 0;
  const LATE = 120;
  for (const h of active) {
    const series = timeSeries.get(h.id) ?? [];
    if (series.length < 3) continue;
    const typical = median(series.map((s) => s.min));
    const doneMap = new Map(series.map((s) => [s.date, s.min]));

    let prevDueDone: { date: string; min: number } | null = null;
    for (const d of dateList) {
      if (!isDueByDay(h.frequency as Freq, d)) continue;
      const min = doneMap.get(d);
      if (min != null) {
        prevDueDone = { date: d, min };
        continue;
      }
      // 今天该做但没做，且上一次该做的做了 → 算一次断
      if (prevDueDone) {
        breaks++;
        if (prevDueDone.min - typical >= LATE) lateBefore++;
        prevDueDone = null;
      }
    }
  }

  return {
    correlations: correlations.slice(0, 3),
    drift: drift.slice(0, 3),
    precursor: breaks >= 2 ? { breaks, lateBefore, lateMinutes: LATE } : null,
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
    i.correlations.length
      ? `习惯之间的带动关系：${i.correlations
          .map((c) => `做「${c.from}」的那天，「${c.to}」完成率 ${c.withA}%；不做时只有 ${c.withoutA}%`)
          .join("；")}`
      : "",
    i.drift.length
      ? `打卡时间在往后拖：${i.drift.map((d) => `「${d.title}」最近 ${d.days} 次从 ${d.from} 拖到 ${d.to}`).join("；")}`
      : "",
    i.precursor && i.precursor.lateBefore >= 1
      ? `断签前兆：过去 ${i.precursor.breaks} 次断签里，有 ${i.precursor.lateBefore} 次前一天打卡比平时晚了 ${i.precursor.lateMinutes} 分钟以上`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}
