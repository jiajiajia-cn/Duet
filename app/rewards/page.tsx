import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { expireOverdueRedemptions } from "@/lib/redemptions";

function cover(images: unknown): string | null {
  return Array.isArray(images) && images.length > 0 ? String(images[0]) : null;
}

export default async function RewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  await expireOverdueRedemptions(ctx.circle.id);

  const { cat, error } = await searchParams;

  const [rewards, wallet, openGroups] = await Promise.all([
    prisma.reward.findMany({
      where: { circleId: ctx.circle.id, status: { in: ["ACTIVE", "SOLD_OUT", "PAUSED"] } },
      orderBy: [{ sortWeight: "desc" }, { createdAt: "desc" }],
    }),
    prisma.wallet.findUnique({
      where: { circleId_userId: { circleId: ctx.circle.id, userId: ctx.user.id } },
    }),
    prisma.redemption.findMany({
      where: { circleId: ctx.circle.id, type: "GROUP", status: "OPEN" },
      select: { rewardId: true, raisedPoints: true, pointsCost: true },
    }),
  ]);

  const openMap = new Map(openGroups.map((g) => [g.rewardId, g]));

  const balance = wallet?.balance ?? 0;
  const categories = Array.from(new Set(rewards.map((r) => r.category)));
  const shown = cat ? rewards.filter((r) => r.category === cat) : rewards;

  return (
    <>
      <Header title="奖品" sub={`可用 ${balance.toLocaleString()} 分`} avatar={ctx.user.nickname.slice(0, 1)} />

      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      <div className="chips" style={{ justifyContent: "flex-start", margin: "2px 0 0" }}>
        <Link href="/rewards" className={`chip${!cat ? " on" : ""}`}>
          全部
        </Link>
        {categories.map((c) => (
          <Link key={c} href={`/rewards?cat=${encodeURIComponent(c)}`} className={`chip${cat === c ? " on" : ""}`}>
            {c}
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 6 }}>🎁</div>
          <b>还没有奖品</b>
          <p className="tiny" style={{ margin: "6px 0 14px" }}>
            上架一个，打卡攒的分才有地方花
          </p>
          <Link href="/rewards/new" className="btn">
            上架第一个奖品
          </Link>
        </div>
      ) : (
        <div className="grid">
          {shown.map((r) => {
            const img = cover(r.images);
            const short = r.pointsCost - balance;
            const soldOut = r.stock === 0;
            return (
              <Link key={r.id} href={`/rewards/${r.id}`} className="reward">
                {openMap.has(r.id) ? (
                  <div className="tag g">合兑中</div>
                ) : soldOut ? (
                  <div className="tag">已售罄</div>
                ) : short > 0 ? (
                  <div className="tag g">可合兑</div>
                ) : null}
                <div className="img">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={r.title} className="img-fill" />
                  ) : (
                    "🎁"
                  )}
                </div>
                <div className="b">
                  <div className="nm">{r.title}</div>
                  <div className="pr">
                    {r.pointsCost.toLocaleString()} <small>分</small>
                  </div>

                  {(() => {
                    const full = balance >= r.pointsCost;
                    const ratio = Math.min(1, r.pointsCost > 0 ? balance / r.pointsCost : 1);
                    return (
                      <>
                        <div className={`rbar${full ? " full" : ""}`} aria-hidden="true">
                          <i style={{ width: `${Math.round(ratio * 100)}%` }} />
                        </div>
                        <div className={`tiny rstate${full ? " full" : ""}`}>
                          {full ? "已够，可以换" : `还差 ${short.toLocaleString()} 分`}
                          <span className="rnum">
                            {Math.min(balance, r.pointsCost).toLocaleString()}/{r.pointsCost.toLocaleString()}
                          </span>
                        </div>
                        <div className="tiny rstock">{r.stock == null ? "不限量" : `剩 ${r.stock} 份`}</div>
                      </>
                    );
                  })()}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Link href="/rewards/new" className="btn" style={{ marginTop: 16 }}>
        ＋ 上架一个奖品
      </Link>

      <div className="section-title">
        <b>管理</b>
      </div>
      <Link href="/orders" className="btn ghost">
        我的兑换
      </Link>
      {ctx.role === "OWNER" || ctx.role === "ADMIN" ? (
        <Link href="/admin/rewards" className="btn ghost" style={{ marginTop: 10 }}>
          全部奖品（编辑 / 归档）
        </Link>
      ) : null}
    </>
  );
}
