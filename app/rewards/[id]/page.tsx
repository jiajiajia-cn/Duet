import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { expireOverdueRedemptions } from "@/lib/redemptions";
import { redeemAction, startGroupAction, joinGroupAction } from "@/app/actions/redeem";

const FULFILL_TEXT: Record<string, string> = {
  VIRTUAL: "虚拟奖品 · 自动发放",
  PHYSICAL: "实物 · 需要交付",
  OFFLINE: "线下领取 / 体验",
};

export default async function RewardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; group?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { id } = await params;
  const { error } = await searchParams;
  await expireOverdueRedemptions(ctx.circle.id);

  const reward = await prisma.reward.findFirst({ where: { id, circleId: ctx.circle.id } });
  if (!reward) redirect("/rewards");

  const [wallet, used, openGroup] = await Promise.all([
    prisma.wallet.findUnique({
      where: { circleId_userId: { circleId: ctx.circle.id, userId: ctx.user.id } },
    }),
    prisma.redemption.count({
      where: {
        rewardId: id,
        initiatorId: ctx.user.id,
        status: { in: ["OPEN", "APPROVED", "FULFILLED", "COMPLETED"] },
      },
    }),
    prisma.redemption.findFirst({
      where: { rewardId: id, status: "OPEN" },
      include: { participants: { include: { user: { select: { nickname: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const balance = wallet?.balance ?? 0;
  const short = reward.pointsCost - balance;
  const imgs = Array.isArray(reward.images) ? (reward.images as string[]) : [];
  const soldOut = reward.stock === 0 && !openGroup;
  const canAfford = balance >= reward.pointsCost;
  // limitPerUser = 0 表示每人无限次
  const left = reward.limitPerUser > 0 ? reward.limitPerUser - used : Number.POSITIVE_INFINITY;
  const inGroup = openGroup?.participants.some((p) => p.userId === ctx.user.id) ?? false;
  const remaining = openGroup ? openGroup.pointsCost - openGroup.raisedPoints : 0;

  return (
    <>
      <header className="header">
        <Link href="/rewards" className="tiny">
          ‹ 返回
        </Link>
        {ctx.role === "OWNER" || ctx.role === "ADMIN" || reward.createdBy === ctx.user.id ? (
          <Link href={`/rewards/${id}/edit`} className="tiny" style={{ marginLeft: "auto" }}>
            编辑
          </Link>
        ) : null}
      </header>

      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      <div
        style={{
          position: "relative",
          height: 168,
          borderRadius: 20,
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          fontSize: 56,
          background: "linear-gradient(135deg,#e9e7ff,#dff5ee)",
        }}
      >
        {imgs.length ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgs[0]} alt={reward.title} className="img-fill" />
        ) : (
          "🎁"
        )}
      </div>

      <h1 style={{ margin: "14px 0 0", fontSize: 21, letterSpacing: "-0.4px" }}>{reward.title}</h1>
      {reward.description ? (
        <p className="muted" style={{ fontSize: 13, margin: "6px 0 0", lineHeight: 1.6 }}>
          {reward.description}
        </p>
      ) : null}

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "14px 0" }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: "var(--brand)", letterSpacing: "-1px" }}>
          {reward.pointsCost.toLocaleString()}
          <span style={{ fontSize: 13, color: "var(--ink3)", marginLeft: 2, fontWeight: 600 }}>分</span>
        </div>
        {short > 0 ? (
          <span className="pill warn">你还差 {short.toLocaleString()} 分</span>
        ) : (
          <span className="pill ok">积分够啦</span>
        )}
      </div>

      <div className="card" style={{ padding: "4px 14px" }}>
        <div className="kv">
          <span>库存</span>
          <b>
            {reward.stock == null
              ? "不限量"
              : openGroup && reward.stock === 0
                ? "1 份（合兑中）"
                : `${reward.stock} 份`}
          </b>
        </div>
        <div className="kv">
          <span>每人限兑</span>
          <b>
            {reward.limitPerUser > 0 ? `${reward.limitPerUser} 次` : "无限次"}
            {used > 0 ? `（已兑 ${used} 次）` : ""}
          </b>
        </div>
        <div className="kv">
          <span>履约方式</span>
          <b>{FULFILL_TEXT[reward.fulfillmentType]}</b>
        </div>
        <div className="kv">
          <span>分类</span>
          <b>{reward.category}</b>
        </div>
      </div>

      {openGroup ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
            <span>合兑中</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {openGroup.raisedPoints} / {openGroup.pointsCost}
            </span>
          </div>
          <div className="bar" style={{ marginTop: 8 }}>
            <i style={{ width: `${Math.min(100, (openGroup.raisedPoints / openGroup.pointsCost) * 100)}%` }} />
          </div>
          {openGroup.participants.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0" }}>
              <div className="avatar" style={{ width: 28, height: 28, borderRadius: 9, fontSize: 12 }}>
                {p.user.nickname.slice(0, 1)}
              </div>
              <div style={{ flex: 1, fontSize: 13 }}>{p.user.nickname}</div>
              <b style={{ fontSize: 13 }}>出 {p.points}</b>
            </div>
          ))}
          <div className="tiny" style={{ marginTop: 6 }}>
            还差 {remaining} 分 · {openGroup.expiresAt ? `${Math.max(0, Math.ceil((openGroup.expiresAt.getTime() - Date.now()) / 3600_000))} 小时内有效` : ""}
          </div>

          {inGroup ? (
            <div className="tiny" style={{ marginTop: 10 }}>你已经在这单里了，还差 {remaining} 分</div>
          ) : (
            <form action={joinGroupAction} style={{ marginTop: 10 }}>
              <input type="hidden" name="redemptionId" value={openGroup.id} />
              <input type="hidden" name="points" value={remaining} />
              <button className="btn" type="submit" disabled={balance < remaining}>
                {balance < remaining ? `积分不够（还差 ${remaining - balance}）` : `出 ${remaining} 分，凑齐它`}
              </button>
            </form>
          )}
        </div>
      ) : null}

      {soldOut ? (
        <div className="tiny" style={{ marginTop: 14 }}>已换完</div>
      ) : left <= 0 ? (
        <div className="tiny" style={{ marginTop: 14 }}>已达每人限兑 {reward.limitPerUser} 次</div>
      ) : (
        <div style={{ marginTop: 14 }}>
          {canAfford ? (
            <form action={redeemAction}>
              <input type="hidden" name="rewardId" value={id} />
              <button className="btn" type="submit">
                用 {reward.pointsCost.toLocaleString()} 分兑换
              </button>
            </form>
          ) : (
            <form action={startGroupAction}>
              <input type="hidden" name="rewardId" value={id} />
              <div className="field" style={{ marginBottom: 10 }}>
                <span>先出多少分（剩下的等对方补）</span>
                <input
                  name="myPoints"
                  type="number"
                  min={1}
                  max={balance}
                  defaultValue={Math.min(balance, reward.pointsCost - 1)}
                />
              </div>
              <button className="btn" type="submit">
                发起合兑
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
