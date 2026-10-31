import { prisma } from "./db";
import { localDateString, shiftDate } from "./date";
import { isDueByDay, isoWeekday, type Freq } from "./frequency";

export type Period = "week" | "month" | "lastMonth";

export function periodRange(period: Period, today: string, weekStart = 1) {
  const d = new Date(`${today}T00:00:00Z`);

  if (period === "week") {
    const wd = isoWeekday(today);
    const offset = weekStart === 1 ? wd - 1 : wd % 7;
    const start = shiftDate(today, -offset);
    return { start, end: today, label: "本周" };
  }

  if (period === "month") {
    const start = `${today.slice(0, 7)}-01`;
    return { start, end: today, label: "本月" };
  }

  // 上月
  const firstOfThis = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = shiftDate(firstOfThis, -1);
  const start = `${lastMonthEnd.slice(0, 7)}-01`;
  return { start, end: lastMonthEnd, label: "上月" };
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = shiftDate(cur, 1);
  }
  return out;
}

/** 习惯创建日期之前不该算进分母 */
function clampDates(dates: string[], createdAt: Date, timezone?: string): string[] {
  const created = localDateString(timezone ?? "Asia/Shanghai", 0, createdAt);
  return dates.filter((d) => d >= created);
}

/** 某习惯在一个区间里「应该做几天」 */
function dueDays(freq: Freq, dates: string[]): number {
  const kind = freq.kind ?? "daily";
  if (kind === "perWeek") {
    const weeks = Math.ceil(dates.length / 7);
    return Math.min(dates.length, weeks * Math.max(1, freq.times ?? 3));
  }
  return dates.filter((d) => isDueByDay(freq, d)).length;
}

export type HabitReport = {
  id: string;
  title: string;
  icon: string;
  done: number;
  due: number;
  rate: number;
};

export type Report = {
  label: string;
  start: string;
  end: string;
  days: number;
  checkins: number;
  dueTotal: number;
  doneTotal: number;
  rate: number;
  earned: number;
  spent: number;
  focusMinutes: number;
  redemptions: number;
  habits: HabitReport[];
};

export async function buildReport(opts: {
  circleId: string;
  userId: string;
  today: string;
  period: Period;
  weekStart?: number;
  timezone?: string;
  joinedAt?: Date;
}): Promise<Report> {
  const { circleId, userId, today, period, weekStart = 1, timezone, joinedAt } = opts;
  const { start, end, label } = periodRange(period, today, weekStart);
  // 注册之前的日期不算
  const joinedDate = joinedAt ? localDateString(timezone ?? "Asia/Shanghai", 0, joinedAt) : start;
  const dates = datesBetween(start, end).filter((d) => d >= joinedDate);

  const [habits, checkins, txns, sessions, redemptions] = await Promise.all([
    prisma.habit.findMany({
      where: { circleId, status: "ACTIVE", OR: [{ ownerId: userId }, { collaborative: true }] },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.checkin.findMany({
      where: { userId, localDate: { gte: start, lte: end }, status: "APPROVED" },
      select: { habitId: true, localDate: true },
    }),
    prisma.pointTxn.findMany({
      where: {
        wallet: { circleId, userId },
        createdAt: { gte: new Date(`${start}T00:00:00`), lte: new Date(`${end}T23:59:59`) },
      },
      select: { type: true, delta: true },
    }),
    prisma.timerSession.findMany({
      where: {
        userId,
        status: "COMPLETED",
        startedAt: { gte: new Date(`${start}T00:00:00`), lte: new Date(`${end}T23:59:59`) },
      },
      select: { elapsedSeconds: true },
    }),
    prisma.redemption.count({
      where: {
        circleId,
        participants: { some: { userId } },
        createdAt: { gte: new Date(`${start}T00:00:00`), lte: new Date(`${end}T23:59:59`) },
        status: { in: ["APPROVED", "FULFILLED", "COMPLETED"] },
      },
    }),
  ]);

  const perHabit = new Map<string, Set<string>>();
  for (const c of checkins) {
    const set = perHabit.get(c.habitId) ?? new Set<string>();
    set.add(c.localDate);
    perHabit.set(c.habitId, set);
  }

  const habitRows: HabitReport[] = habits.map((h) => {
    const doneSet = perHabit.get(h.id) ?? new Set<string>();
    const done = doneSet.size;
    const habitDates = clampDates(dates, h.createdAt, timezone);
    const due = Math.max(1, dueDays((h.frequency ?? { kind: "daily" }) as Freq, habitDates));
    return {
      id: h.id,
      title: h.title,
      icon: h.icon,
      done,
      due,
      rate: Math.min(100, Math.round((done / due) * 100)),
    };
  });

  const dueTotal = habitRows.reduce((s, h) => s + h.due, 0);
  const doneTotal = habitRows.reduce((s, h) => s + Math.min(h.done, h.due), 0);

  let earned = 0;
  let spent = 0;
  for (const t of txns) {
    if (t.delta > 0) earned += t.delta;
    else spent += -t.delta;
  }

  return {
    label,
    start,
    end,
    days: dates.length,
    checkins: checkins.length,
    dueTotal,
    doneTotal,
    rate: dueTotal ? Math.round((doneTotal / dueTotal) * 100) : 0,
    earned,
    spent,
    focusMinutes: Math.round(sessions.reduce((s, x) => s + x.elapsedSeconds, 0) / 60),
    redemptions,
    habits: habitRows.sort((a, b) => b.rate - a.rate),
  };
}
