import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import CopyButton from "@/components/CopyButton";
import { getContext } from "@/lib/queries";
import { localDateString, humanDate, shiftDate } from "@/lib/date";
import { buildDayReport, dayReportToMarkdown } from "@/lib/day-report";

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/habits");

  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
  if (date > today) redirect("/habits");

  const r = await buildDayReport({
    circleId: ctx.circle.id,
    userId: ctx.user.id,
    date,
    timezone: ctx.user.timezone,
    dayStartHour: ctx.user.dayStartHour,
  });

  const md = dayReportToMarkdown(r);
  const done = r.habits.filter((h) => h.done).length;

  return (
    <>
      <Header
        title={`${humanDate(date)}`}
        sub={`打卡 ${done}/${r.habits.length} · 专注 ${r.focusMinutes} 分钟`}
        back={{ href: "/habits", label: "习惯" }}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <CopyButton text={md} />
        </div>
        <a
          href={`/api/day/${date}`}
          className="btn ghost"
          style={{ flex: 1, height: 46, fontSize: 14, textDecoration: "none" }}
        >
          下载 .md
        </a>
      </div>

      {r.habits.length === 0 && r.timers.length === 0 && r.txns.length === 0 ? (
        <div className="empty">这一天没有记录。</div>
      ) : null}

      {r.habits.length ? (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="tiny" style={{ marginBottom: 6 }}>
            打卡 {done}/{r.habits.length}
          </div>
          {r.habits.map((h) => (
            <div key={h.title} className="kv">
              <span>
                <span style={{ color: h.done ? "var(--ok)" : "var(--ink3)" }}>{h.done ? "✓" : "○"}</span>{" "}
                {h.time ? <span style={{ color: "var(--ink3)", fontVariantNumeric: "tabular-nums" }}>{h.time} </span> : null}
                {h.icon} {h.title}
                {h.quantity > 1 ? ` ×${h.quantity}` : ""}
              </span>
              <b style={{ color: h.done ? "var(--ok)" : "var(--ink3)" }}>
                {h.done ? (h.points ? `+${h.points}` : "—") : "未完成"}
              </b>
            </div>
          ))}
        </div>
      ) : null}

      {r.timers.length ? (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="tiny" style={{ marginBottom: 6 }}>
            专注 {r.focusMinutes} 分钟
          </div>
          {r.timers.map((t, i) => (
            <div key={i} className="kv">
              <span>
                {t.skill}
              </span>
              <b>
                {t.minutes} 分钟{t.points ? ` · +${t.points}` : ""}
              </b>
            </div>
          ))}
        </div>
      ) : null}

      {r.txns.length ? (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="tiny" style={{ marginBottom: 6 }}>
            积分 +{r.earned} / -{r.spent}
          </div>
          {r.txns.map((t, i) => (
            <div key={i} className="kv">
              <span>{t.reason}</span>
              <b style={{ color: t.delta > 0 ? "var(--ok)" : "var(--danger)" }}>
                {t.delta > 0 ? "+" : ""}
                {t.delta}
              </b>
            </div>
          ))}
        </div>
      ) : null}

      {r.redemptions.length ? (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="tiny" style={{ marginBottom: 6 }}>
            兑换
          </div>
          {r.redemptions.map((x, i) => (
            <div key={i} className="kv">
              <span>{x.title}</span>
              <b>{x.points} 分</b>
            </div>
          ))}
        </div>
      ) : null}

      {r.entries.length ? (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="tiny" style={{ marginBottom: 6 }}>
            日程
          </div>
          {r.entries.map((e, i) => (
            <div key={i} className="kv">
              <span>
                {e.time} {e.title}
              </span>
              <b className="tiny">{e.note ?? ""}</b>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 4 }}>
        <div className="tiny" style={{ marginBottom: 6 }}>
          markdown 预览
        </div>
        <pre
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.65,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            color: "var(--ink2)",
          }}
        >
          {md}
        </pre>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {date > shiftDate(today, -60) ? (
          <Link href={`/day/${shiftDate(date, -1)}`} className="btn ghost" style={{ flex: 1, height: 44, fontSize: 13 }}>
            ‹ 前一天
          </Link>
        ) : (
          <div style={{ flex: 1 }} />
        )}
        {date < today ? (
          <Link href={`/day/${shiftDate(date, 1)}`} className="btn ghost" style={{ flex: 1, height: 44, fontSize: 13 }}>
            后一天 ›
          </Link>
        ) : (
          <div style={{ flex: 1 }} />
        )}
      </div>

      <Link href="/habits" className="btn ghost" style={{ marginTop: 10, textAlign: "center" }}>
        回习惯页
      </Link>
    </>
  );
}
