import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Mascot from "@/components/Mascot";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { localDateString, shiftDate } from "@/lib/date";
import { occursOn, REPEAT_TEXT, parseRepeat, timeOf } from "@/lib/schedule";
import { toggleEntryAction } from "@/app/actions/schedule";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { ok } = await searchParams;
  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(today, i));

  const entries = await prisma.entry.findMany({
    where: { userId: ctx.user.id, status: { not: "CANCELLED" } },
    orderBy: { startAt: "asc" },
  });

  const byDay = new Map<string, typeof entries>();
  for (const d of days) {
    const list = entries
      .filter((e) => occursOn(e, d))
      .sort((a, b) => (a.allDay ? -1 : b.allDay ? 1 : (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0)));
    if (list.length) byDay.set(d, list);
  }

  const todayList = byDay.get(today) ?? [];

  return (
    <>
      <Header title="日程" sub={`${todayList.length} 件事今天`} avatar={ctx.user.nickname.slice(0, 1)} />

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}

      <Link href="/schedule/new" className="btn">
        ＋ 加一个安排
      </Link>

      <div className="section-title">
        <b>今天</b>
        <span className="tiny">{today}</span>
      </div>

      {todayList.length === 0 ? (
        <>
          <div style={{ textAlign: "center" }}>
            <Mascot className="mascot mascot-inline" pose="read" />
          </div>
          <div className="empty">今天没有安排。</div>
        </>
      ) : (
        todayList.map((e) => (
          <div key={e.id} className="card" style={{ marginTop: 10, opacity: e.status === "DONE" ? 0.6 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 4, height: 34, borderRadius: 4, background: e.color, flex: "none" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, textDecoration: e.status === "DONE" ? "line-through" : "none" }}>
                  {e.title}
                </div>
                <div className="tiny" style={{ marginTop: 2 }}>
                  {e.allDay ? "全天" : `${timeOf(e.startAt)} – ${timeOf(e.endAt)}`}
                  {e.category ? ` · ${e.category}` : ""}
                  {parseRepeat(e.rrule).kind !== "none" ? ` · ${REPEAT_TEXT[parseRepeat(e.rrule).kind]}` : ""}
                </div>
              </div>
              <form action={toggleEntryAction}>
                <input type="hidden" name="id" value={e.id} />
                <button className={`check${e.status === "DONE" ? " done" : ""}`} type="submit">
                  {e.status === "DONE" ? "✓" : ""}
                </button>
              </form>
            </div>
            {e.note ? <div className="tiny" style={{ marginTop: 8 }}>{e.note}</div> : null}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Link href={`/schedule/${e.id}/edit`} className="btn ghost" style={{ flex: 1, padding: 8, fontSize: 12, textAlign: "center" }}>
                编辑
              </Link>
              {e.estimateMin ? (
                <span className="tiny" style={{ alignSelf: "center" }}>预计 {e.estimateMin} 分钟</span>
              ) : null}
            </div>
          </div>
        ))
      )}

      <div className="section-title">
        <b>接下来 6 天</b>
      </div>

      {days.slice(1).every((d) => !byDay.has(d)) ? (
        <div className="empty">接下来的日子还是空的。</div>
      ) : (
        days.slice(1).map((d) => {
          const list = byDay.get(d);
          if (!list) return null;
          const dt = new Date(`${d}T12:00:00Z`);
          return (
            <div key={d} style={{ marginTop: 14 }}>
              <div className="tiny" style={{ marginBottom: 6 }}>
                {dt.getUTCMonth() + 1} 月 {dt.getUTCDate()} 日 · 周{WEEKDAY[dt.getUTCDay()]}
              </div>
              {list.map((e) => (
                <div key={`${d}-${e.id}`} className="habit">
                  <div className="ico" style={{ background: `${e.color}22`, fontSize: 15 }}>
                    {e.allDay ? "📌" : "🕒"}
                  </div>
                  <div className="meta">
                    <div className="name">{e.title}</div>
                    <div className="sub">
                      {e.allDay ? "全天" : `${timeOf(e.startAt)} – ${timeOf(e.endAt)}`}
                      {e.category ? ` · ${e.category}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })
      )}

    </>
  );
}
