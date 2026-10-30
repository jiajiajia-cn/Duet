import Link from "next/link";
import { redirect } from "next/navigation";
import TimerClient from "@/components/TimerClient";
import type { ActiveSession, SkillOption } from "@/components/TimerClient";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { resolveCreditRule } from "@/lib/credit";
import { cleanupStaleSessions, assignSkillFormAction } from "@/app/actions/timer";

function hhmmss(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default async function TimerPage({
  searchParams,
}: {
  searchParams: Promise<{ habit?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { habit: initialHabitId } = await searchParams;

  await cleanupStaleSessions(ctx.user.id);

  const [active, skills, records, rule, timedHabits] = await Promise.all([
    prisma.timerSession.findFirst({
      where: { userId: ctx.user.id, status: { in: ["RUNNING", "PAUSED"] } },
      orderBy: { startedAt: "desc" },
      include: { skill: { select: { name: true } } },
    }),
    prisma.skill.findMany({
      where: { circleId: ctx.circle.id, ownerId: ctx.user.id, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    }),
    prisma.timerSession.findMany({
      // 放弃的记录不显示，免得看着闹心
      where: { userId: ctx.user.id, status: "COMPLETED" },
      orderBy: { startedAt: "desc" },
      take: 12,
      include: { skill: { select: { name: true, icon: true } } },
    }),
    resolveCreditRule(prisma, ctx.circle.id, null),
    prisma.habit.findMany({
      where: { circleId: ctx.circle.id, ownerId: ctx.user.id, status: "ACTIVE", type: "TIMED" },
      select: { id: true, title: true },
    }),
  ]);

  const todaySeconds = records
    .filter((r) => new Date(r.startedAt).toDateString() === new Date().toDateString())
    .reduce((sum, r) => sum + r.elapsedSeconds, 0);

  const activeProp: ActiveSession | null = active
    ? {
        id: active.id,
        mode: active.mode as ActiveSession["mode"],
        phase: active.phase as ActiveSession["phase"],
        status: active.status as ActiveSession["status"],
        plannedSeconds: active.plannedSeconds,
        startedAtMs: new Date(active.startedAt).getTime(),
        pausedTotalSeconds: active.pausedTotalSeconds,
        pausedAtMs: active.pausedAt ? new Date(active.pausedAt).getTime() : null,
        skillId: active.skillId,
        skillName: active.skill?.name ?? null,
        round: active.round,
      }
    : null;

  const roundsToday = await prisma.timerSession.count({
    where: {
      userId: ctx.user.id,
      mode: "POMODORO",
      phase: "FOCUS",
      status: "COMPLETED",
      startedAt: { gte: new Date(Date.now() - 20 * 3600_000) },
    },
  });

  const skillOptions: SkillOption[] = skills.map((s) => ({ id: s.id, name: s.name, icon: s.icon }));

  const ruleText = !rule
    ? "还没有设置计分规则"
    : rule.mode === "TIER"
      ? rule.tiers.length
        ? rule.tiers.map((t) => `${t.minutes} 分钟 = ${t.points} 分`).join(" · ")
        : "阶梯表还是空的"
      : rule.mode === "PER_MINUTE"
        ? `每 ${rule.minutesPerUnit} 分钟 ${rule.pointsPerUnit} 分`
        : `达标一次 ${rule.pointsPerSession} 分`;

  return (
    <>
      <header className="header">
        <div>
          <Link href="/" className="tiny" style={{ display: "inline-block", marginBottom: 2 }}>
            ‹ 今天
          </Link>
          <h1>计时</h1>
        </div>
        <Link href="/settings/credit" className="tiny" style={{ marginLeft: "auto", color: "var(--brand)", fontWeight: 700 }}>
          计分规则 ›
        </Link>
      </header>

      <TimerClient
        initialHabitId={initialHabitId ?? ""}
        active={activeProp}
        skills={skillOptions}
        timedHabits={timedHabits}
        pomo={{ focus: 25, short: 5, long: 15, every: 4, roundsToday }}
      />


      <div className="tiny" style={{ textAlign: "center", marginTop: 6 }}>
        {ruleText} ·{" "}
        <Link href="/settings/credit" style={{ color: "var(--brand)", fontWeight: 600 }}>
          改规则
        </Link>
      </div>

      <Link href="/rooms" className="settings-row" style={{ marginTop: 12 }}>
        <span className="ico">👥</span>
        <span style={{ flex: 1 }}>
          <b>去自习室</b>
          <em>和别人一起倒计时</em>
        </span>
        <span className="tiny">›</span>
      </Link>

      <div className="section-title">
        <b>最近的记录</b>
        <span className="tiny">今天共 {hhmmss(todaySeconds)}</span>
      </div>

      {records.length === 0 ? (
        <div className="empty">还没有记录</div>
      ) : (
        records.map((r) => (
          <div key={r.id} className="card" style={{ marginTop: 10, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="ico" style={{ width: 38, height: 38, borderRadius: 12, fontSize: 17 }}>
                {r.skill?.icon ?? "⏳"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {r.skill?.name ?? "未分类"} {hhmmss(r.elapsedSeconds)}
                </div>
                <div className="tiny" style={{ marginTop: 2 }}>
                  {new Date(r.startedAt).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                    hour12: false,
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {r.pointsAwarded > 0 ? ` · +${r.pointsAwarded} 分` : ""}
                </div>
              </div>
              <span className={`pill ${r.status === "COMPLETED" ? "ok" : "warn"}`}>
                {r.status === "COMPLETED" ? "完成" : "放弃"}
              </span>
            </div>

            {!r.skillId && r.status === "COMPLETED" ? (
              <form action={assignSkillFormAction} style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input type="hidden" name="sessionId" value={r.id} />
                <select
                  name="skillId"
                  className="chip"
                  style={{ flex: 1, padding: "8px 10px" }}
                  defaultValue=""
                >
                  <option value="">归到技能…</option>
                  {skillOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.icon} {s.name}
                    </option>
                  ))}
                </select>
                <button className="btn ghost" type="submit" style={{ width: 76, padding: 8, fontSize: 13 }}>
                  归类
                </button>
              </form>
            ) : null}
          </div>
        ))
      )}
    </>
  );
}
