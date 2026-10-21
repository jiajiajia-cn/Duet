import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { expireOverdueRedemptions, REDEMPTION_STATUS_TEXT, statusTone } from "@/lib/redemptions";
import { fulfillAction } from "@/app/actions/redeem";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") redirect("/rewards");

  const { ok } = await searchParams;
  await expireOverdueRedemptions(ctx.circle.id);

  const orders = await prisma.redemption.findMany({
    where: { circleId: ctx.circle.id, status: { notIn: ["EXPIRED", "CANCELLED", "REFUNDED"] } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 60,
    include: {
      participants: { include: { user: { select: { nickname: true } } } },
    },
  });

  const pending = orders.filter((o) => o.status === "APPROVED").length;

  return (
    <>
      <Header title="兑换管理" sub={`${orders.length} 单 · ${pending} 单待发放`} avatar={ctx.user.nickname.slice(0, 1)} />

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}

      {orders.length === 0 ? (
        <div className="empty">还没有兑换单。</div>
      ) : (
        orders.map((o) => {
          const snap = o.snapshot as { title?: string; pointsCost?: number };
          const who = o.participants.map((p) => `${p.user.nickname} ${p.points}分`).join(" + ");
          return (
            <div key={o.id} className="card" style={{ marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{snap.title ?? "奖品"}</div>
                  <div className="tiny" style={{ marginTop: 3 }}>
                    {new Date(o.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })} · {o.type === "GROUP" ? "合兑" : "单人"}
                  </div>
                </div>
                <span className={`pill ${statusTone(o.status)}`.trim()}>
                  {REDEMPTION_STATUS_TEXT[o.status] ?? o.status}
                </span>
              </div>

              <div className="kv" style={{ marginTop: 6 }}>
                <span>出资</span>
                <b>{who}</b>
              </div>
              <div className="kv">
                <span>合计</span>
                <span>
                  {o.raisedPoints} / {o.pointsCost} 分
                </span>
              </div>

              {o.status === "APPROVED" ? (
                <form action={fulfillAction} style={{ marginTop: 10 }}>
                  <input type="hidden" name="redemptionId" value={o.id} />
                  <button className="btn" type="submit" style={{ padding: 11, fontSize: 14 }}>
                    标记已发放
                  </button>
                </form>
              ) : null}
            </div>
          );
        })
      )}

      <Link href="/admin/rewards" className="btn ghost" style={{ marginTop: 14 }}>
        去管理奖品
      </Link>
    </>
  );
}
