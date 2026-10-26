import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { deleteHabitAction, setHabitStatusAction } from "@/app/actions/habits";

export default async function ArchivedHabitsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { ok, error } = await searchParams;

  const habits = await prisma.habit.findMany({
    where: { circleId: ctx.circle.id, status: { in: ["ARCHIVED", "PAUSED"] } },
    orderBy: [{ archivedAt: "desc" }, { updatedAt: "desc" }],
    include: { _count: { select: { checkins: true } } },
  });

  const canDelete = (ownerId: string) =>
    ownerId === ctx.user.id || ctx.role === "OWNER" || ctx.role === "ADMIN";

  return (
    <>
      <Header
        title="归档的习惯"
        sub={`${habits.length} 个已归档 / 暂停`}
        back={{ href: "/habits", label: "习惯" }}
      />

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      {habits.length === 0 ? (
        <div className="empty">没有归档或暂停的习惯。</div>
      ) : (
        habits.map((h) => (
          <div key={h.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="ico" style={{ width: 38, height: 38, borderRadius: 12, fontSize: 17 }}>
                {h.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 650, fontSize: 15 }}>
                  {h.title}
                  <span className="pill warn" style={{ marginLeft: 8 }}>
                    {h.status === "ARCHIVED" ? "已归档" : "已暂停"}
                  </span>
                </div>
                <div className="tiny" style={{ marginTop: 3 }}>
                  {h._count.checkins} 条打卡记录
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <form action={setHabitStatusAction} style={{ flex: 1 }}>
                <input type="hidden" name="id" value={h.id} />
                <input type="hidden" name="status" value="ACTIVE" />
                <button className="btn ghost" type="submit" style={{ width: "100%", height: 40, fontSize: 13 }}>
                  恢复
                </button>
              </form>

              {canDelete(h.ownerId) ? (
                <form action={deleteHabitAction} style={{ flex: 1 }}>
                  <input type="hidden" name="id" value={h.id} />
                  <ConfirmSubmit
                    message={`彻底删除「${h.title}」？\n\n它的 ${h._count.checkins} 条打卡记录和连续天数会一起删掉，无法恢复。`}
                    style={{ width: "100%", height: 40, fontSize: 13, color: "var(--danger)" }}
                  >
                    彻底删除
                  </ConfirmSubmit>
                </form>
              ) : null}
            </div>
          </div>
        ))
      )}

      <div className="hint" style={{ marginTop: 14, lineHeight: 1.6 }}>
        「暂停」只是暂时不出现，随时恢复；「彻底删除」会把打卡记录一起删掉。
      </div>

      <Link href="/habits" className="btn ghost" style={{ marginTop: 12, textAlign: "center" }}>
        回习惯页
      </Link>
    </>
  );
}
