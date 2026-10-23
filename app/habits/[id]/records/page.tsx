import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { deleteCheckinAction } from "@/app/actions/checkin";

const SOURCE_TEXT: Record<string, string> = {
  MANUAL: "手动",
  TIMER: "计时",
  BACKFILL: "补记",
  ADMIN: "调整",
  MAKEUP: "补签",
};

export default async function HabitRecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { id } = await params;
  const { ok, error } = await searchParams;

  const habit = await prisma.habit.findFirst({ where: { id, circleId: ctx.circle.id } });
  if (!habit) redirect("/habits");
  if (habit.ownerId !== ctx.user.id && ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    redirect("/habits");
  }

  const records = await prisma.checkin.findMany({
    where: { habitId: id, ...(habit.collaborative ? {} : { userId: ctx.user.id }) },
    orderBy: [{ localDate: "desc" }, { seq: "desc" }],
    take: 60,
    include: { user: { select: { nickname: true } } },
  });

  const backTo = `/habits/${id}/records`;

  return (
    <>
      <Header
        title={habit.title}
        sub={`最近 ${records.length} 条打卡记录`}
        avatar={ctx.user.nickname.slice(0, 1)}
        back={{ href: "/habits", label: "习惯" }}
      />

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      {records.length === 0 ? (
        <div className="empty">还没有打卡记录。</div>
      ) : (
        records.map((r) => (
          <div key={r.id} className="card" style={{ marginBottom: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 650, fontSize: 15 }}>
                  {r.localDate}
                  <span className="pill" style={{ marginLeft: 8 }}>
                    {SOURCE_TEXT[r.source] ?? r.source}
                  </span>
                  {r.status === "PENDING" ? (
                    <span className="pill warn" style={{ marginLeft: 6 }}>
                      待确认
                    </span>
                  ) : null}
                </div>
                <div className="tiny" style={{ marginTop: 3 }}>
                  {habit.collaborative ? `${r.user.nickname} · ` : ""}
                  {r.pointsAwarded > 0 ? `+${r.pointsAwarded} 分` : "无积分"}
                  {r.quantity > 1 ? ` · ${r.quantity} 次` : ""}
                </div>
              </div>
              <form action={deleteCheckinAction}>
                <input type="hidden" name="checkinId" value={r.id} />
                <input type="hidden" name="backTo" value={backTo} />
                <button
                  className="btn ghost"
                  type="submit"
                  style={{ width: "auto", padding: "6px 12px", fontSize: 12, color: "var(--danger)" }}
                >
                  删除
                </button>
              </form>
            </div>
          </div>
        ))
      )}

      <div className="hint" style={{ marginTop: 14, lineHeight: 1.6 }}>
        删除会同时退回这条记录的积分，并重算连续天数。
        <br />
        想补回某天，用「补打卡」或「补签卡」。
      </div>

      <Link href="/backfill" className="btn ghost" style={{ marginTop: 12, textAlign: "center" }}>
        去补打卡
      </Link>
    </>
  );
}
