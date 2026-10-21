import Link from "next/link";
import { redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import Mascot from "@/components/Mascot";
import { checkInAction, undoCheckinAction, seedDemoAction } from "@/app/actions/checkin";
import { getToday } from "@/lib/queries";
import { humanDate } from "@/lib/date";
import { prisma } from "@/lib/db";
import { occursOn } from "@/lib/schedule";

export default async function TodayPage() {
  const data = await getToday();
  if (!data) redirect("/login");

  const { ctx, today, rows, balance, totalEarned } = data;
  const doneCount = rows.filter((r) => r.done).length;
  const progress = rows.length ? Math.round((doneCount / rows.length) * 100) : 0;

  const [pending, rooms, entries] = await Promise.all([
    prisma.checkin.findMany({
      where: { habit: { circleId: ctx.circle.id }, status: "PENDING", userId: { not: ctx.user.id } },
      include: { user: { select: { nickname: true } } },
      orderBy: { checkedAt: "desc" },
      take: 20,
    }),
    prisma.room.count({ where: { circleId: ctx.circle.id, status: "OPEN" } }),
    prisma.entry.findMany({
      where: { userId: ctx.user.id, status: { not: "CANCELLED" } },
      select: { startAt: true, rrule: true },
    }),
  ]);

  const pendingNames = Array.from(new Set(pending.map((p) => p.user.nickname)));
  const todayEntries = entries.filter((e) => e.startAt && occursOn(e as { startAt: Date; rrule: string | null }, today)).length;

  return (
    <>
      <header className="header">
        <div>
          <h1>今天</h1>
          <div className="sub">{humanDate(today)}</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Avatar url={ctx.user.avatarUrl} name={ctx.user.nickname} size={36} radius={12} />
        </div>
      </header>

      <div className="wallet">
        <div className="lbl">可用积分</div>
        <div className="num">
          {balance.toLocaleString()}
          <small>分</small>
        </div>
        <Mascot className="mascot wallet-mascot" pose="happy" />
        <div className="row">
          <span>
            累计 <b>{totalEarned.toLocaleString()}</b>
          </span>
          <span>
            习惯 <b>{rows.length}</b>
          </span>
          <span>
            今天完成 <b>{doneCount}</b>
          </span>
        </div>
      </div>

      {pending.length > 0 ? (
        <Link href="/review" className="review-banner">
          <span className="em">👀</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b>
              {pendingNames.join("、")} 有 {pending.length} 条打卡等你确认
            </b>
          </span>
          <span className="go">去确认 ›</span>
        </Link>
      ) : null}

      <div className="quick-row">
        <Link href="/review" className="quick">
          <div className="qi">👀</div>
          <div className="qt">待确认</div>
          <div className="qs">{pending.length ? `${pending.length} 条` : "没有"}</div>
          {pending.length ? <span className="badge">{pending.length}</span> : null}
        </Link>
        <Link href="/rooms" className="quick">
          <div className="qi">👥</div>
          <div className="qt">自习室</div>
          <div className="qs">{rooms ? `${rooms} 间开着` : "去开一间"}</div>
        </Link>
        <Link href="/schedule" className="quick">
          <div className="qi">📅</div>
          <div className="qt">日程</div>
          <div className="qs">{todayEntries ? `今天 ${todayEntries} 件` : "今天空着"}</div>
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
          <Mascot className="mascot mascot-inline" pose="sleep" />
          <div style={{ fontSize: 34, marginBottom: 6 }}>🌱</div>
          <b>还没有习惯</b>
          <p className="tiny" style={{ marginTop: 6, lineHeight: 1.6 }}>
            先铺一套示例习惯，之后随时改
          </p>
          <form action={seedDemoAction} style={{ marginTop: 12 }}>
            <button className="btn" type="submit">
              一键创建示例习惯
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="section-title">
            <b>今天 {rows.length} 件事</b>
            <span className="tiny">
              已完成 <b>{doneCount}</b>/{rows.length}
            </span>
          </div>
          <div className="bar">
            <i style={{ width: `${progress}%` }} />
          </div>

          <div>
            {rows.map((row) => (
              <div
                key={row.id}
                className={`habit${row.done ? " done" : ""}${row.team?.completed ? " team-done" : ""}`}
              >
                <div className="ico">{row.icon}</div>
                <div className="meta">
                  <div className="name">
                    {row.title}
                    {row.pill ? (
                      <span className={`pill ${row.pill.kind ?? ""}`.trim()}>{row.pill.text}</span>
                    ) : null}
                    {row.team?.completed ? (
                      <Mascot className="mascot team-mascot" pose="cheer" style={{ width: 24, height: 24 }} />
                    ) : null}
                  </div>
                  <div className="sub">{row.sub}</div>
                  {row.team && !row.team.completed ? (
                    <div className="team-bar">
                      {Array.from({ length: row.team.total }).map((_, i) => (
                        <i key={i} className={i < row.team!.done ? "on" : ""} />
                      ))}
                    </div>
                  ) : null}
                </div>
                {row.type === "timed" ? (
                  <Link href="/timer" className="check">
                    ▶
                  </Link>
                ) : (
                  <form action={row.done ? undoCheckinAction : checkInAction}>
                    <input type="hidden" name="habitId" value={row.id} />
                    <button
                      type="submit"
                      className={`check${row.done ? " done" : ""}`}
                      aria-label={row.done ? "撤销打卡" : "打卡"}
                      title={row.done ? "点一下撤销" : "打卡"}
                    >
                      {row.done ? "✓" : ""}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>

        </>
      )}
    </>
  );
}
