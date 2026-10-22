import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { checkInAction, undoCheckinAction } from "@/app/actions/checkin";
import { getToday } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { shiftDate, weekdayIndex } from "@/lib/date";

export default async function HabitsPage() {
  const data = await getToday();
  if (!data) redirect("/login");

  const { ctx, today, rows } = data;

  // 近 12 周热力图
  const gridStart = (() => {
    const start = shiftDate(today, -83);
    const offset = (weekdayIndex(start) + 6) % 7; // 周一为一周起点
    return shiftDate(start, -offset);
  })();

  const checkins = await prisma.checkin.findMany({
    where: { userId: ctx.user.id, localDate: { gte: gridStart }, status: "APPROVED" },
    select: { localDate: true },
  });

  const counts = new Map<string, number>();
  for (const c of checkins) counts.set(c.localDate, (counts.get(c.localDate) ?? 0) + 1);
  const max = Math.max(1, ...counts.values());

  const cells: { date: string; level: number }[] = [];
  for (let i = 0; i < 84; i++) {
    const date = shiftDate(gridStart, i);
    const n = counts.get(date) ?? 0;
    const level = n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4));
    cells.push({ date, level });
  }

  return (
    <>
      <Header title="习惯" sub={`${rows.length} 个习惯`} avatar={ctx.user.nickname.slice(0, 1)} />

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <b>今天完成率</b>
          <span style={{ fontWeight: 800, color: "var(--ok)" }}>
            {rows.length ? Math.round((rows.filter((r) => r.done).length / rows.length) * 100) : 0}%
          </span>
        </div>
        <div className="bar" style={{ marginTop: 10 }}>
          <i
            style={{
              width: `${rows.length ? (rows.filter((r) => r.done).length / rows.length) * 100 : 0}%`,
              background: "linear-gradient(90deg,#10b981,#4bd6a7)",
            }}
          />
        </div>
        <div className="tiny" style={{ marginTop: 8 }}>
          共 {checkins.length} 次打卡记录 · 近 12 周
        </div>
      </div>

      <div className="section-title">
        <b>近 12 周</b>
      </div>
      <div className="card">
        <div className="heat">
          {cells.map((c) => (
            <i key={c.date} className={c.level ? `l${c.level}` : ""} title={`${c.date} · ${counts.get(c.date) ?? 0} 次`} />
          ))}
        </div>

      </div>

      <div className="section-title">
        <b>全部习惯</b>
        <Link href="/habits/new" className="tiny" style={{ color: "var(--brand)", fontWeight: 700 }}>
          ＋ 新建
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="empty">还没有习惯。回「今天」点一键创建示例，或直接新建一个。</div>
      ) : (
        rows.map((h) => (
          <div key={h.id} className={`habit${h.done ? " done" : ""}`}>
            <div className="ico">{h.icon}</div>
            <Link href={`/habits/${h.id}/edit`} className="meta" style={{ color: "inherit" }}>
              <div className="name">
                {h.title}
                {h.pill ? <span className={`pill ${h.pill.kind ?? ""}`.trim()}>{h.pill.text}</span> : null}
              </div>
              <div className="sub">{h.sub}</div>
            </Link>
            {h.type === "timed" ? (
              <Link href="/timer" className="check">
                ▶
              </Link>
            ) : (
              <form action={h.done ? undoCheckinAction : checkInAction}>
                <input type="hidden" name="habitId" value={h.id} />
                <button type="submit" className={`check${h.done ? " done" : ""}`} title={h.done ? "点一下撤销" : "打卡"}>
                  {h.done ? "✓" : ""}
                </button>
              </form>
            )}
          </div>
        ))
      )}

    </>
  );
}
