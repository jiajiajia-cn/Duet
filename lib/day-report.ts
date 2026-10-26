import { prisma } from "./db";
import { isDueByDay, type Freq } from "./frequency";

export type DayReport = {
  date: string;
  weekday: string;
  habits: { title: string; icon: string; done: boolean; points: number; quantity: number; source: string; time: string | null }[];
  timers: { skill: string; minutes: number; points: number; phase: string }[];
  txns: { reason: string; delta: number }[];
  redemptions: { title: string; points: number; status: string }[];
  entries: { title: string; time: string; note: string | null }[];
  earned: number;
  spent: number;
  focusMinutes: number;
};

const WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const SOURCE_TEXT: Record<string, string> = {
  MANUAL: "手动",
  TIMER: "计时",
  BACKFILL: "补记",
  ADMIN: "调整",
  MAKEUP: "补签",
};

/** 某一天的全部记录，用来生成小日报 */
export async function buildDayReport(opts: {
  circleId: string;
  userId: string;
  date: string;
  timezone: string;
  dayStartHour: number;
}): Promise<DayReport> {
  const { circleId, userId, date, timezone } = opts;

  const [habits, checkins, sessions, txns, redemptions, entries] = await Promise.all([
    prisma.habit.findMany({
      where: { circleId, status: { in: ["ACTIVE", "PAUSED", "ARCHIVED"] }, OR: [{ ownerId: userId }, { collaborative: true }] },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.checkin.findMany({
      where: { userId, localDate: date, status: "APPROVED" },
      orderBy: { seq: "asc" },
    }),
    prisma.timerSession.findMany({
      where: {
        userId,
        status: "COMPLETED",
        startedAt: {
          gte: new Date(`${date}T00:00:00+08:00`),
          lt: new Date(`${date}T23:59:59+08:00`),
        },
      },
      include: { skill: { select: { name: true } } },
      orderBy: { startedAt: "asc" },
    }),
    prisma.pointTxn.findMany({
      where: {
        wallet: { circleId, userId },
        createdAt: {
          gte: new Date(`${date}T00:00:00+08:00`),
          lt: new Date(`${date}T23:59:59+08:00`),
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.redemption.findMany({
      where: {
        circleId,
        participants: { some: { userId } },
        createdAt: {
          gte: new Date(`${date}T00:00:00+08:00`),
          lt: new Date(`${date}T23:59:59+08:00`),
        },
      },
      include: { reward: { select: { title: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.entry.findMany({
      where: { userId, status: { not: "CANCELLED" } },
      orderBy: { startAt: "asc" },
    }),
  ]);

  const byHabit = new Map<string, { points: number; quantity: number; source: string; time: string }>();
  for (const c of checkins) {
    const prev = byHabit.get(c.habitId);
    const time = new Date(c.checkedAt).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    });
    byHabit.set(c.habitId, {
      points: (prev?.points ?? 0) + c.pointsAwarded,
      quantity: (prev?.quantity ?? 0) + c.quantity,
      // 多次打卡取最早那次的时间
      time: prev?.time ?? time,
      source: c.source,
    });
  }

  const habitRows = habits
    .filter((h) => {
      const hit = byHabit.get(h.id);
      // 我打过卡的，一定显示
      if (hit) return true;
      // 其余只显示「我今天该做、而且是我自己的」习惯
      // （别人名下的、需要我确认的，都不进我的日报）
      if (h.status === "ARCHIVED") return false;
      if (h.ownerId !== userId) return false;
      return isDueByDay(h.frequency as Freq, date);
    })
    .map((h) => {
      const hit = byHabit.get(h.id);
      return {
        title: h.title,
        icon: h.icon,
        done: Boolean(hit),
        points: hit?.points ?? 0,
        quantity: hit?.quantity ?? 0,
        source: SOURCE_TEXT[hit?.source ?? ""] ?? "",
        time: hit?.time ?? null,
      };
    });

  const timerRows = sessions.filter((s) => s.phase === "FOCUS").map((s) => ({
    skill: s.skill?.name ?? "未分类",
    minutes: Math.round(s.elapsedSeconds / 60),
    points: s.pointsAwarded,
    phase: s.phase === "FOCUS" ? "专注" : "休息",
  }));

  const entryRows = entries
    .filter((e) => {
      if (!e.startAt) return false;
      return new Date(e.startAt).toISOString().slice(0, 10) === date;
    })
    .map((e) => ({
      title: e.title,
      time: new Date(e.startAt as Date).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone,
      }),
      note: e.note,
    }));

  let earned = 0;
  let spent = 0;
  for (const t of txns) {
    if (t.delta > 0) earned += t.delta;
    else spent += -t.delta;
  }

  const d = new Date(`${date}T00:00:00Z`);

  return {
    date,
    weekday: WD[d.getUTCDay()],
    habits: habitRows,
    timers: timerRows,
    txns: txns.map((t) => ({ reason: t.reason ?? "", delta: t.delta })),
    redemptions: redemptions.map((r) => ({
      title: r.reward.title,
      points: r.pointsCost,
      status: r.status,
    })),
    entries: entryRows,
    earned,
    spent,
    focusMinutes: timerRows.reduce((s, t) => s + t.minutes, 0),
  };
}

/** 转成可以直接贴进日记的 markdown */
export function dayReportToMarkdown(r: DayReport): string {
  const lines: string[] = [];
  lines.push(`## ${r.date} ${r.weekday}`);
  lines.push("");

  const done = r.habits.filter((h) => h.done);
  const todo = r.habits.filter((h) => !h.done);

  if (r.habits.length) {
    lines.push(`**打卡** ${done.length}/${r.habits.length}`);
    for (const h of done) {
      const q = h.quantity > 1 ? ` ×${h.quantity}` : "";
      lines.push(`- [x] ${h.time ? h.time + " " : ""}${h.title}${q}${h.points ? ` +${h.points}` : ""}${h.source && h.source !== "手动" ? `（${h.source}）` : ""}`);
    }
    for (const h of todo) lines.push(`- [ ] ${h.title}`);
    lines.push("");
  }

  if (r.timers.length) {
    lines.push(`**专注** ${r.focusMinutes} 分钟`);
    for (const t of r.timers) {
      lines.push(`- ${t.skill} ${t.minutes} 分钟${t.points ? ` +${t.points}` : ""}`);
    }
    lines.push("");
  }

  if (r.earned || r.spent) {
    lines.push(`**积分** +${r.earned} / -${r.spent}`);
    for (const t of r.txns) {
      lines.push(`- ${t.delta > 0 ? "+" : ""}${t.delta} ${t.reason}`);
    }
    lines.push("");
  }

  if (r.redemptions.length) {
    lines.push("**兑换**");
    for (const x of r.redemptions) {
      lines.push(`- ${x.title}（${x.points} 分）`);
    }
    lines.push("");
  }

  if (r.entries.length) {
    lines.push("**日程**");
    for (const e of r.entries) {
      lines.push(`- ${e.time} ${e.title}${e.note ? ` · ${e.note}` : ""}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}
