import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { localDateString, shiftDate } from "@/lib/date";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { deleteSkillAction, setSkillStatusAction } from "@/app/actions/skills";

function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} 分钟`;
  return `${h} 小时 ${m} 分`;
}

export default async function SkillDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { id } = await params;
  const { ok } = await searchParams;

  const skill = await prisma.skill.findFirst({ where: { id, circleId: ctx.circle.id } });
  if (!skill) redirect("/skills");

  const since = new Date(Date.now() - 90 * 86400_000);
  const sessions = await prisma.timerSession.findMany({
    where: { skillId: id, status: "COMPLETED", startedAt: { gte: since } },
    orderBy: { startedAt: "desc" },
  });

  const tz = ctx.user.timezone;
  const dayStart = ctx.user.dayStartHour;
  const today = localDateString(tz, dayStart);

  // 每天分钟数
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const d = localDateString(tz, dayStart, new Date(s.startedAt));
    byDay.set(d, (byDay.get(d) ?? 0) + s.elapsedSeconds);
  }

  // 近 30 天柱状图
  const days30 = Array.from({ length: 30 }, (_, i) => shiftDate(today, -(29 - i)));
  const max30 = Math.max(1, ...days30.map((d) => byDay.get(d) ?? 0));

  // 近 12 周热力图（周一起）
  const gridStart = (() => {
    const start = shiftDate(today, -83);
    const offset = (new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7;
    return shiftDate(start, -offset);
  })();
  const cells = Array.from({ length: 84 }, (_, i) => {
    const date = shiftDate(gridStart, i);
    return { date, seconds: byDay.get(date) ?? 0 };
  });
  const maxCell = Math.max(1, ...cells.map((c) => c.seconds));

  const hours = skill.totalSeconds / 3600;
  const level = Math.min(10, Math.floor(hours / 10) + 1);
  const nextGap = 10 - (hours % 10);
  const pct = skill.targetHours ? Math.min(100, (hours / skill.targetHours) * 100) : null;

  return (
    <>
      <header className="header">
        <Link href="/skills" className="tiny">‹ 技能</Link>
        <Link href={`/skills/${id}/edit`} className="tiny" style={{ marginLeft: "auto", color: "var(--brand)", fontWeight: 700 }}>
          编辑
        </Link>
      </header>

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div className="ico" style={{ width: 62, height: 62, borderRadius: 20, fontSize: 28, background: `${skill.color}22` }}>
          {skill.icon}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.4px" }}>{skill.name}</h1>
          <div className="tiny" style={{ marginTop: 4 }}>
            Lv.{level} · 距下一级还差 {nextGap.toFixed(1)} 小时
          </div>
        </div>
      </div>

      {skill.description ? (
        <p className="muted" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.6 }}>{skill.description}</p>
      ) : null}

      <div className="wallet" style={{ marginTop: 14, padding: 16, background: `linear-gradient(135deg, ${skill.color}, ${skill.color}bb)` }}>
        <div className="lbl">累计投入</div>
        <div className="num" style={{ fontSize: 32 }}>{hours.toFixed(1)}<small>小时</small></div>
        <div className="row">
          <span>{sessions.length} 段记录</span>
          {skill.targetHours ? <span>目标 {skill.targetHours} 小时</span> : null}
        </div>
      </div>

      {pct != null ? (
        <div className="bar" style={{ marginTop: 10 }}>
          <i style={{ width: `${pct}%`, background: skill.color }} />
        </div>
      ) : null}

      <div className="section-title">
        <b>近 30 天</b>
        <span className="tiny">每天投入时长</span>
      </div>
      <div className="card">
        <div className="bars">
          {days30.map((d) => {
            const v = byDay.get(d) ?? 0;
            const h = v === 0 ? 0 : Math.max(6, Math.round((v / max30) * 68));
            return <i key={d} style={{ height: h, background: v ? skill.color : "#e9ebf3" }} title={`${d} · ${Math.round(v / 60)} 分钟`} />;
          })}
        </div>
        <div className="tiny" style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
          <span>{days30[0].slice(5)}</span>
          <span>今天</span>
        </div>
      </div>

      <div className="section-title">
        <b>近 12 周</b>
      </div>
      <div className="card">
        <div className="heat">
          {cells.map((c) => {
            const lvl = c.seconds === 0 ? 0 : Math.min(4, Math.ceil((c.seconds / maxCell) * 4));
            return <i key={c.date} className={lvl ? `l${lvl}` : ""} title={`${c.date} · ${Math.round(c.seconds / 60)} 分钟`} />;
          })}
        </div>
      </div>

      <div className="section-title">
        <b>最近记录</b>
      </div>
      {sessions.length === 0 ? (
        <div className="empty">还没有记录。去计时页开一段试试。</div>
      ) : (
        sessions.slice(0, 8).map((s) => (
          <div key={s.id} className="habit">
            <div className="meta">
              <div className="name">{fmtDuration(s.elapsedSeconds)}</div>
              <div className="sub">
                {new Date(s.startedAt).toLocaleString("zh-CN", { timeZone: tz, hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                {s.pointsAwarded > 0 ? ` · +${s.pointsAwarded} 分` : ""}
              </div>
            </div>
          </div>
        ))
      )}

      <form action={setSkillStatusAction} style={{ marginTop: 16 }}>
        <input type="hidden" name="id" value={skill.id} />
        <input type="hidden" name="status" value={skill.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED"} />
        <button className="btn ghost" type="submit" style={{ width: "100%", padding: 11, fontSize: 14 }}>
          {skill.status === "ARCHIVED" ? "恢复这个技能" : "归档这个技能"}
        </button>
      </form>

      <form action={deleteSkillAction} style={{ marginTop: 10 }}>
        <input type="hidden" name="id" value={skill.id} />
        <ConfirmSubmit
          message={`彻底删除「${skill.name}」？\n\n计时记录不会删，但会变成「未分类」，无法恢复。`}
          style={{ width: "100%", padding: 11, fontSize: 14, color: "var(--danger)" }}
        >
          彻底删除这个技能
        </ConfirmSubmit>
      </form>

    </>
  );
}
