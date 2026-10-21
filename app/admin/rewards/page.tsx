import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { setRewardStatusAction } from "@/app/actions/rewards";

const STATUS_TEXT: Record<string, string> = {
  DRAFT: "草稿",
  ACTIVE: "在架",
  PAUSED: "已暂停",
  SOLD_OUT: "售罄",
  ARCHIVED: "已归档",
};

export default async function AdminRewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") redirect("/rewards");

  const { ok } = await searchParams;

  const rewards = await prisma.reward.findMany({
    where: { circleId: ctx.circle.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { redemptions: true } } },
  });

  return (
    <>
      <Header title="奖品管理" sub={`${rewards.length} 个奖品`} avatar={ctx.user.nickname.slice(0, 1)} />

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}

      <Link href="/rewards/new" className="btn">
        ＋ 上架新奖品
      </Link>

      {rewards.length === 0 ? (
        <div className="empty">还没有奖品。</div>
      ) : (
        rewards.map((r) => {
          const archived = r.status === "ARCHIVED";
          return (
            <div key={r.id} className="card" style={{ marginTop: 10, opacity: archived ? 0.6 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {r.title}
                    <span className={`pill ${r.status === "ACTIVE" ? "ok" : "warn"}`} style={{ marginLeft: 6 }}>
                      {STATUS_TEXT[r.status] ?? r.status}
                    </span>
                  </div>
                  <div className="tiny" style={{ marginTop: 3 }}>
                    {r.pointsCost.toLocaleString()} 分 · {r.category} · 库存 {r.stock ?? "不限"} · 已兑 {r._count.redemptions} 次
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <Link href={`/rewards/${r.id}`} className="btn ghost" style={{ flex: 1, padding: 10, fontSize: 13, textAlign: "center" }}>
                  预览
                </Link>
                <Link href={`/rewards/${r.id}/edit`} className="btn ghost" style={{ flex: 1, padding: 10, fontSize: 13, textAlign: "center" }}>
                  编辑
                </Link>
                <form action={setRewardStatusAction} style={{ flex: 1 }}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="status" value={archived ? "ACTIVE" : "ARCHIVED"} />
                  <button className="btn ghost" type="submit" style={{ width: "100%", padding: 10, fontSize: 13 }}>
                    {archived ? "恢复上架" : "归档"}
                  </button>
                </form>
              </div>
            </div>
          );
        })
      )}

    </>
  );
}
