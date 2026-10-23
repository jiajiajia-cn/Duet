import { prisma } from "./db";
import { shiftDate } from "./date";
import { isDueByDay, type Freq } from "./frequency";

export type CircleSettings = {
  makeupCardPrice?: number;
  allowBackfillDays?: number;
};

export function makeupPrice(settings: unknown): number {
  const s = (settings ?? {}) as CircleSettings;
  const n = Number(s.makeupCardPrice ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** 我手上还有几张没用（表还没建好时不影响页面其他部分） */
export async function unusedCards(circleId: string, userId: string) {
  try {
    return await prisma.makeupCard.count({ where: { circleId, userId, usedAt: null } });
  } catch {
    return 0;
  }
}

/**
 * 最近 N 天里，哪些「该做但没做」的日子可以补。
 * perWeek（每周 N 次）不列出——它没有「必须某天做」的语义。
 */
export async function missedDays(opts: {
  circleId: string;
  userId: string;
  today: string;
  days?: number;
}) {
  const { circleId, userId, today, days = 7 } = opts;

  try {
    await prisma.makeupCard.count({ where: { circleId, userId } });
  } catch {
    return [];
  }

  const habits = await prisma.habit.findMany({
    where: {
      circleId,
      status: "ACTIVE",
      OR: [{ ownerId: userId }, { collaborative: true }],
      type: { not: "TIMED" },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const oldest = shiftDate(today, -(days - 1));
  const done = await prisma.checkin.findMany({
    where: { userId, localDate: { gte: oldest, lte: today } },
    select: { habitId: true, localDate: true },
  });
  const doneSet = new Set(done.map((d) => `${d.habitId}:${d.localDate}`));

  const out: { habitId: string; title: string; icon: string; date: string }[] = [];

  for (const h of habits) {
    const freq = (h.frequency ?? { kind: "daily" }) as Freq;
    if ((freq.kind ?? "daily") === "perWeek") continue;

    for (let i = days - 1; i >= 1; i--) {
      const date = shiftDate(today, -i);
      if (!isDueByDay(freq, date)) continue;
      if (doneSet.has(`${h.id}:${date}`)) continue;
      out.push({ habitId: h.id, title: h.title, icon: h.icon, date });
    }
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** 重算某个习惯的连续天数（补签 / 撤销后都要调） */
export async function recomputeStreak(
  tx: { checkin: { findMany: Function }; habitStat: { findUnique: Function; upsert: Function } },
  habitId: string,
  userId: string,
  today: string,
) {
  const rows = (await tx.checkin.findMany({
    where: { habitId, userId },
    select: { localDate: true },
    distinct: ["localDate"],
    orderBy: { localDate: "desc" },
    take: 500,
  })) as { localDate: string }[];

  const set = new Set(rows.map((r) => r.localDate));
  let cursor = set.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }

  const prev = (await tx.habitStat.findUnique({
    where: { habitId_userId: { habitId, userId } },
  })) as { bestStreak: number } | null;

  const best = Math.max(streak, prev?.bestStreak ?? 0);

  await tx.habitStat.upsert({
    where: { habitId_userId: { habitId, userId } },
    create: {
      habitId,
      userId,
      currentStreak: streak,
      bestStreak: best,
      lastDoneDate: rows[0]?.localDate ?? null,
      totalDone: rows.length,
    },
    update: {
      currentStreak: streak,
      bestStreak: best,
      lastDoneDate: rows[0]?.localDate ?? null,
      totalDone: rows.length,
    },
  });

  return streak;
}
