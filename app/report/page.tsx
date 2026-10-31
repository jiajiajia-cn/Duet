import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { getContext } from "@/lib/queries";
import { localDateString, humanDate } from "@/lib/date";
import { buildReport, type Period } from "@/lib/report";

const TABS: { key: Period; label: string }[] = [
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "lastMonth", label: "上月" },
];

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { period } = await searchParams;
  const active: Period = period === "month" || period === "lastMonth" ? period : "week";
  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);

  const r = await buildReport({
    circleId: ctx.circle.id,
    userId: ctx.user.id,
    today,
    period: active,
    weekStart: ctx.user.weekStart ?? 1,
    timezone: ctx.user.timezone,
    joinedAt: ctx.user.createdAt,
  });

  return (
    <>
      <Header
        title="回顾"
        sub={`${r.label} · ${humanDate(r.start)} – ${humanDate(r.end)}`}
        avatar={ctx.user.nickname.slice(0, 1)}
        back={{ href: "/me", label: "我的" }}
      />

      <div className="chips" style={{ justifyContent: "flex-start" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/report?period=${t.key}`}
            className={`chip${active === t.key ? " on" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.04em" }}>{r.rate}%</div>
          <div className="tiny">完成率</div>
        </div>
        <div className="bar" style={{ marginTop: 10 }}>
          <i style={{ width: `${r.rate}%` }} />
        </div>
        <div className="tiny" style={{ marginTop: 8 }}>
          该做 {r.dueTotal} 次，实际完成 {r.doneTotal} 次
        </div>
      </div>

      <div className="quick-row" style={{ marginTop: 12 }}>
        <div className="quick">
          <div className="qi">✅</div>
          <div className="qt">{r.checkins}</div>
          <div className="qs">次打卡</div>
        </div>
        <div className="quick">
          <div className="qi">⏱️</div>
          <div className="qt">{r.focusMinutes}</div>
          <div className="qs">分钟专注</div>
        </div>
        <div className="quick">
          <div className="qi">🎁</div>
          <div className="qt">{r.redemptions}</div>
          <div className="qs">次兑换</div>
        </div>
        <div className="quick">
          <div className="qi">💎</div>
          <div className="qt">{r.earned}</div>
          <div className="qs">赚到的分</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="kv">
          <span>获得积分</span>
          <b style={{ color: "var(--ok)" }}>+{r.earned}</b>
        </div>
        <div className="kv">
          <span>花掉积分</span>
          <b style={{ color: "var(--danger)" }}>-{r.spent}</b>
        </div>
        <div className="kv">
          <span>净变化</span>
          <b>{r.earned - r.spent >= 0 ? "+" : ""}{r.earned - r.spent}</b>
        </div>
      </div>

      <div className="section-title">
        <b>各习惯完成情况</b>
      </div>

      {r.habits.length === 0 ? (
        <div className="empty">这个时间段还没有习惯。</div>
      ) : (
        r.habits.map((h) => (
          <div key={h.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontWeight: 650, fontSize: 14.5 }}>
                {h.icon} {h.title}
              </span>
              <span className="tiny">
                {h.done}/{h.due}
              </span>
            </div>
            <div className="rbar" style={{ marginTop: 8 }}>
              <i style={{ width: `${h.rate}%` }} />
            </div>
          </div>
        ))
      )}

      <Link href="/me" className="btn ghost" style={{ marginTop: 14, textAlign: "center" }}>
        回我的
      </Link>
    </>
  );
}
