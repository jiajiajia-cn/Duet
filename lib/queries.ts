import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getUserId } from "./session";
import { localDateString, shiftDate } from "./date";
import type { HabitRow } from "./types";

export { requireUserId } from "./guards";

export type Context = {
  user: { id: string; nickname: string; avatarUrl: string | null; timezone: string; dayStartHour: number };
  circle: { id: string; name: string; inviteCode: string; settings: unknown };
  role: string;
};

export async function getContext(): Promise<Context | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      timezone: true,
      dayStartHour: true,
      activeCircleId: true,
    },
  });
  if (!user) return null;

  const include = {
    circle: { select: { id: true, name: true, inviteCode: true, settings: true } },
  } as const;

  const member =
    (user.activeCircleId
      ? await prisma.circleMember.findFirst({
          where: { userId, status: "ACTIVE", circleId: user.activeCircleId },
          include,
        })
      : null) ??
    (await prisma.circleMember.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { joinedAt: "asc" },
      include,
    }));

  // 登录了但还没加入任何圈子 → 去引导页
  if (!member) redirect("/welcome");

  return { user, circle: member.circle, role: member.role };
}

/** 今天要做的习惯 + 是否已完成 + 积分余额 */
export async function getToday() {
  const ctx = await getContext();
  if (!ctx) return null;

  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);

  const [habits, checkins, wallet, stats, teamCheckins, memberTotal] = await Promise.all([
    prisma.habit.findMany({
      where: {
        circleId: ctx.circle.id,
        status: "ACTIVE",
        OR: [{ ownerId: ctx.user.id }, { collaborative: true }],
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.checkin.findMany({
      where: { userId: ctx.user.id, localDate: today, status: { in: ["APPROVED", "PENDING"] } },
      select: { habitId: true, quantity: true, pointsAwarded: true, status: true },
    }),
    prisma.wallet.findUnique({
      where: { circleId_userId: { circleId: ctx.circle.id, userId: ctx.user.id } },
    }),
    prisma.habitStat.findMany({ where: { userId: ctx.user.id } }),
    prisma.checkin.findMany({
      where: {
        habit: { circleId: ctx.circle.id, collaborative: true },
        localDate: today,
        status: "APPROVED",
      },
      select: { habitId: true, userId: true },
    }),
    prisma.circleMember.count({ where: { circleId: ctx.circle.id, status: "ACTIVE" } }),
  ]);

  const doneMap = new Map(checkins.map((c) => [c.habitId, c]));
  const statMap = new Map(stats.map((s) => [s.habitId, s]));

  const teamDone = new Map<string, Set<string>>();
  for (const c of teamCheckins) {
    const set = teamDone.get(c.habitId) ?? new Set<string>();
    set.add(c.userId);
    teamDone.set(c.habitId, set);
  }

  const rows: HabitRow[] = habits.map((h) => {
    const done = doneMap.get(h.id);
    const stat = statMap.get(h.id);
    const isQuantity = h.type === "QUANTITY";
    const points =
      h.type === "QUANTITY"
        ? h.pointsPerUnit
        : h.type === "TIMED"
          ? 0
          : h.pointsPerCheckin;

    const team = h.collaborative
      ? {
          done: teamDone.get(h.id)?.size ?? 0,
          total: Math.max(1, memberTotal),
          completed: (teamDone.get(h.id)?.size ?? 0) >= Math.max(1, memberTotal),
        }
      : undefined;

    const sub = team
      ? `${team.done}/${team.total} 人已打卡 · 全员完成各得 ${h.pointsPerCheckin} 分`
      : h.type === "QUANTITY"
        ? `每${h.unit ?? "次"} +${h.pointsPerUnit} 分`
        : h.type === "TIMED"
          ? "计时达标自动打卡"
          : h.type === "NEGATIVE"
            ? `守住 +${h.pointsPerCheckin} 分`
            : `+${h.pointsPerCheckin} 分`;

    return {
      id: h.id,
      title: h.title,
      icon: h.icon,
      sub,
      points,
      type: isQuantity
        ? "quantity"
        : h.type === "TIMED"
          ? "timed"
          : h.type === "NEGATIVE"
            ? "negative"
            : "check",
      done: Boolean(done),
      team,
      pill: team
        ? team.completed
          ? { text: "一起成功", kind: "ok" as const }
          : { text: "一起打卡", kind: "brand" as const }
        : done?.status === "PENDING"
          ? { text: "待确认", kind: "warn" as const }
          : stat && stat.currentStreak > 1
            ? { text: `连续 ${stat.currentStreak} 天`, kind: "ok" as const }
            : h.type === "TIMED"
              ? { text: "计时", kind: "brand" as const }
              : undefined,
    };
  });

  return {
    ctx,
    today,
    rows,
    balance: wallet?.balance ?? 0,
    weekEarned: wallet?.totalEarned ?? 0,
    totalEarned: wallet?.totalEarned ?? 0,
    pendingDelivery: 0,
    yesterday: shiftDate(today, -1),
  };
}

/** 新建账号时的空状态：一键铺一套示例习惯 */
export async function hasAnyHabit(circleId: string) {
  const n = await prisma.habit.count({ where: { circleId } });
  return n > 0;
}
