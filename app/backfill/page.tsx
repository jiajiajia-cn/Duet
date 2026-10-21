import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { localDateString, shiftDate } from "@/lib/date";
import { backfillAction } from "@/app/actions/checkin";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

export default async function BackfillPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(today, -(7 - i)));

  const habits = await prisma.habit.findMany({
    where: { circleId: ctx.circle.id, ownerId: ctx.user.id, status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
  });

  const since = shiftDate(today, -8);
  const checkins = await prisma.checkin.findMany({
    where: { userId: ctx.user.id, localDate: { gte: since } },
    select: { habitId: true, localDate: true },
  });
  const done = new Set(checkins.map((c) => `${c.habitId}:${c.localDate}`));

  return (
    <>
      <header className="header">
        <Link href="/settings" className="tiny">‹ 设置</Link>
        <h1 style={{ fontSize: 19 }}>补打卡</h1>
        <span className="tiny" style={{ marginLeft: "auto" }}>最近 7 天 · 不计连续 · 默认 0 分</span>
      </header>

      {habits.length === 0 ? (
        <div className="empty">还没有习惯。</div>
      ) : (
        habits.map((h) => {
          const missing = days.filter((d) => d !== today && !done.has(`${h.id}:${d}`));
          return (
            <div key={h.id} className="card" style={{ marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="ico" style={{ width: 34, height: 34, borderRadius: 11, fontSize: 16 }}>{h.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{h.title}</div>
                  <div className="tiny">{missing.length === 0 ? "这一周都记上了" : `缺 ${missing.length} 天`}</div>
                </div>
              </div>

              {missing.length > 0 ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {missing.map((d) => {
                    const dt = new Date(`${d}T12:00:00Z`);
                    return (
                      <form key={d} action={backfillAction}>
                        <input type="hidden" name="habitId" value={h.id} />
                        <input type="hidden" name="date" value={d} />
                        <button type="submit" className="chip" style={{ padding: "6px 10px" }}>
                          {dt.getUTCMonth() + 1}/{dt.getUTCDate()} 周{WEEKDAY[dt.getUTCDay()]}
                        </button>
                      </form>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })
      )}

    </>
  );
}
