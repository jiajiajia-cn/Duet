import Link from "next/link";
import { redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import Header from "@/components/Header";
import { logoutAction } from "@/app/actions/auth";
import { getContext } from "@/lib/queries";
import { prisma } from "@/lib/db";

export default async function MePage() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const [skills, txns, wallet] = await Promise.all([
    prisma.skill.findMany({
      where: { circleId: ctx.circle.id, ownerId: ctx.user.id, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pointTxn.findMany({
      where: { wallet: { circleId: ctx.circle.id, userId: ctx.user.id } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.wallet.findUnique({
      where: { circleId_userId: { circleId: ctx.circle.id, userId: ctx.user.id } },
    }),
  ]);

  return (
    <>
      <Header title="我的" sub={`${skills.length} 个技能`} />

      <div className="wallet" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div className="lbl">可用积分</div>
            <div className="num">
              {(wallet?.balance ?? 0).toLocaleString()}
              <small>分</small>
            </div>
          </div>
          <Avatar url={ctx.user.avatarUrl} name={ctx.user.nickname} size={44} radius={15} />
        </div>
        <div className="row">
          <span>
            {ctx.user.nickname} · {ctx.role === "OWNER" ? "圈主" : "成员"}
          </span>
          <span>
            累计 <b>{(wallet?.totalEarned ?? 0).toLocaleString()}</b>
          </span>
        </div>
      </div>

      <Link href="/ai" className="settings-row" style={{ marginBottom: 12 }}>
        <span className="ico">🤖</span>
        <span style={{ flex: 1 }}>
          <b>AI 回顾</b>
          <em>每天一份，看看它怎么说</em>
        </span>
        <span className="tiny">›</span>
      </Link>

      <Link href="/report" className="settings-row" style={{ marginBottom: 12 }}>
        <span className="ico">📊</span>
        <span style={{ flex: 1 }}>
          <b>回顾</b>
          <em>周报 / 月报</em>
        </span>
        <span className="tiny">›</span>
      </Link>

      <div className="settings-group">
        <Link href="/settings" className="settings-row">
          <span className="ico">⚙️</span>
          <span style={{ flex: 1 }}>
            <b>设置</b>
            <em>计分规则 · 圈子 · 账号 · 数据导出</em>
          </span>
          <span className="tiny">›</span>
        </Link>
        <Link href="/orders" className="settings-row">
          <span className="ico">🧾</span>
          <span style={{ flex: 1 }}>
            <b>我的兑换</b>
            <em>状态与退分</em>
          </span>
          <span className="tiny">›</span>
        </Link>
        <Link href="/skills" className="settings-row">
          <span className="ico">🎯</span>
          <span style={{ flex: 1 }}>
            <b>技能卡片</b>
            <em>{skills.length} 个</em>
          </span>
          <span className="tiny">›</span>
        </Link>
      </div>

      <div className="section-title">
        <b>技能累计</b>
        <Link href="/skills" className="tiny" style={{ color: "var(--brand)", fontWeight: 700 }}>
          全部 ›
        </Link>
      </div>

      {skills.length === 0 ? (
        <div className="empty">还没有技能卡片，去建一个。</div>
      ) : (
        skills.slice(0, 3).map((s) => {
          const hours = s.totalSeconds / 3600;
          return (
            <Link key={s.id} href={`/skills/${s.id}`} className="skill">
              <div className="ico" style={{ background: "#eef0ff" }}>{s.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                <div className="tiny" style={{ marginTop: 2 }}>
                  Lv.{Math.min(10, Math.floor(hours / 10) + 1)}
                </div>
              </div>
              <div className="h">{hours.toFixed(1)}h</div>
            </Link>
          );
        })
      )}

      <div className="section-title">
        <b>最近积分</b>
      </div>
      <div className="card">
        {txns.length === 0 ? (
          <div className="empty">还没有积分记录。</div>
        ) : (
          txns.map((t) => (
            <div className="kv" key={t.id}>
              <span>{t.reason ?? t.type}</span>
              <b style={{ color: t.delta > 0 ? "var(--ok)" : "var(--danger)" }}>
                {t.delta > 0 ? "+" : "−"}
                {Math.abs(t.delta)}
              </b>
            </div>
          ))
        )}
      </div>

      <form action={logoutAction} style={{ marginTop: 16 }}>
        <button className="btn ghost" type="submit">
          退出登录
        </button>
      </form>
    </>
  );
}
