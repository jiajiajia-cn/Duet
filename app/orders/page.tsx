import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { getContext } from "@/lib/queries";
import { expireOverdueRedemptions, listMyRedemptions, REDEMPTION_STATUS_TEXT, statusTone } from "@/lib/redemptions";
import { cancelRedemptionAction, completeAction } from "@/app/actions/redeem";

function img(images: unknown): string | null {
  return Array.isArray(images) && images.length ? String(images[0]) : null;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; joined?: string; cancelled?: string; error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const sp = await searchParams;
  await expireOverdueRedemptions(ctx.circle.id);
  const orders = await listMyRedemptions(ctx.user.id);

  const banner = sp.new
    ? "兑换成功，等发放就行"
    : sp.joined
      ? "已加入合兑"
      : sp.cancelled
        ? "已取消，积分原路退回"
        : null;

  return (
    <>
      <Header title="我的兑换" sub={`${orders.length} 条记录`} avatar={ctx.user.nickname.slice(0, 1)} />

      {banner ? <div className="alert ok" style={{ marginBottom: 12 }}>{banner}</div> : null}
      {sp.error ? <div className="alert" style={{ marginBottom: 12 }}>{sp.error}</div> : null}

      {orders.length === 0 ? (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 6 }}>🧾</div>
          <b>还没有兑换过</b>
          <p className="tiny" style={{ margin: "6px 0 14px" }}>
            攒够分去换点东西吧
          </p>
          <Link href="/rewards" className="btn">
            去逛奖品
          </Link>
        </div>
      ) : (
        orders.map((o) => {
          const snap = o.snapshot as { title?: string; pointsCost?: number; images?: unknown };
          const cover = img(snap.images) ?? null;
          const mine = o.participants.find((p) => p.user.id === ctx.user.id);
          const isGroup = o.type === "GROUP";
          return (
            <div key={o.id} className="card" style={{ marginTop: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div className="ico thumb" style={{ width: 46, height: 46 }}>
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="img-fill" />
                  ) : (
                    <span style={{ fontSize: 20 }}>🎁</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{snap.title ?? o.reward.title}</div>
                  <div className="tiny" style={{ marginTop: 2 }}>
                    {new Date(o.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}
                    {isGroup ? " · 合兑" : ""}
                  </div>
                </div>
                <span className={`pill ${statusTone(o.status)}`.trim()}>
                  {REDEMPTION_STATUS_TEXT[o.status] ?? o.status}
                </span>
              </div>

              <div className="kv" style={{ marginTop: 8 }}>
                <span>我的出资</span>
                <b>{mine?.points ?? 0} 分</b>
              </div>
              {isGroup ? (
                <div className="kv">
                  <span>合兑进度</span>
                  <span>
                    {o.raisedPoints} / {o.pointsCost}
                  </span>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {["OPEN", "APPROVED"].includes(o.status) ? (
                  <form action={cancelRedemptionAction} style={{ flex: 1 }}>
                    <input type="hidden" name="redemptionId" value={o.id} />
                    <button className="btn ghost" type="submit" style={{ padding: 11, fontSize: 14 }}>
                      取消并退分
                    </button>
                  </form>
                ) : null}
                {o.status === "FULFILLED" && o.recipientId === ctx.user.id ? (
                  <form action={completeAction} style={{ flex: 1 }}>
                    <input type="hidden" name="redemptionId" value={o.id} />
                    <button className="btn" type="submit" style={{ padding: 11, fontSize: 14 }}>
                      确认收到
                    </button>
                  </form>
                ) : null}
                {o.status === "OPEN" ? (
                  <Link href={`/rewards/${o.rewardId}`} className="btn ghost" style={{ flex: 1, padding: 11, fontSize: 14, textAlign: "center" }}>
                    去凑齐
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
