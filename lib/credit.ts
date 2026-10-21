import type { PrismaClient } from "@prisma/client";

export type CreditRuleLike = {
  mode: "TIER" | "PER_MINUTE" | "PER_SESSION";
  tiers: { minutes: number; points: number }[];
  minutesPerUnit: number;
  pointsPerUnit: number;
  pointsPerSession: number;
  minMinutes: number;
  capPerSession: number | null;
  capPerDay: number | null;
  scope: string;
  skillId: string | null;
};

/** 取"最具体"的那条规则：技能级 > 圈子默认 */
export async function resolveCreditRule(
  prisma: PrismaClient,
  circleId: string,
  skillId?: string | null,
): Promise<CreditRuleLike | null> {
  const rules = await prisma.creditRule.findMany({
    where: { circleId, OR: skillId ? [{ scope: "SKILL", skillId }, { scope: "CIRCLE" }] : [{ scope: "CIRCLE" }] },
    orderBy: { scope: "desc" },
  });

  const picked =
    (skillId ? rules.find((r) => r.scope === "SKILL" && r.skillId === skillId) : undefined) ??
    rules.find((r) => r.scope === "CIRCLE") ??
    null;
  if (!picked) return null;

  const tiers = Array.isArray(picked.tiers)
    ? (picked.tiers as { minutes: number; points: number }[])
    : [];

  return {
    mode: picked.mode as CreditRuleLike["mode"],
    tiers,
    minutesPerUnit: picked.minutesPerUnit,
    pointsPerUnit: picked.pointsPerUnit,
    pointsPerSession: picked.pointsPerSession,
    minMinutes: picked.minMinutes,
    capPerSession: picked.capPerSession,
    capPerDay: picked.capPerDay,
    scope: picked.scope,
    skillId: picked.skillId,
  };
}

/** 按时长算分（阶梯取满足的最高档） */
export function pointsFor(rule: CreditRuleLike | null, minutes: number): number {
  if (!rule) return 0;
  if (minutes < rule.minMinutes) return 0;

  let points = 0;
  if (rule.mode === "TIER") {
    const hit = [...rule.tiers]
      .filter((t) => Number.isFinite(t.minutes) && t.minutes <= minutes)
      .sort((a, b) => b.minutes - a.minutes)[0];
    points = hit ? hit.points : 0;
  } else if (rule.mode === "PER_MINUTE") {
    points = Math.floor(minutes / Math.max(1, rule.minutesPerUnit)) * rule.pointsPerUnit;
  } else {
    points = rule.pointsPerSession;
  }

  if (rule.capPerSession != null) points = Math.min(points, rule.capPerSession);
  return Math.max(0, Math.trunc(points));
}

/** 会话净时长（秒）：服务端算，不信前端 */
export function elapsedSecondsOf(session: {
  startedAt: Date;
  pausedTotalSeconds: number;
  pausedAt: Date | null;
  endedAt?: Date | null;
}): number {
  const end = session.endedAt ? session.endedAt.getTime() : Date.now();
  const paused = session.pausedTotalSeconds + (session.pausedAt ? (end - session.pausedAt.getTime()) / 1000 : 0);
  return Math.max(0, Math.floor((end - session.startedAt.getTime()) / 1000 - paused));
}
