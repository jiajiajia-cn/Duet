import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { adjustPointsAction } from "@/app/actions/admin";

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") redirect("/settings");

  const { ok, error } = await searchParams;

  const members = await prisma.circleMember.findMany({
    where: { circleId: ctx.circle.id, status: "ACTIVE" },
    include: { user: { select: { id: true, nickname: true } } },
    orderBy: { joinedAt: "asc" },
  });

  const wallets = await prisma.wallet.findMany({ where: { circleId: ctx.circle.id } });
  const balanceOf = new Map(wallets.map((w) => [w.userId, w.balance]));

  return (
    <>
      <header className="header">
        <Link href="/settings" className="tiny">‹ 设置</Link>
        <h1 style={{ fontSize: 19 }}>成员与积分</h1>
      </header>

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      {members.map((m) => (
        <div key={m.id} className="card" style={{ marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="avatar" style={{ width: 36, height: 36, borderRadius: 12, fontSize: 15 }}>
              {m.user.nickname.slice(0, 1)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{m.user.nickname}</div>
              <div className="tiny">
                {m.role === "OWNER" ? "圈主" : m.role === "ADMIN" ? "管理员" : "成员"} ·{" "}
                {(balanceOf.get(m.user.id) ?? 0).toLocaleString()} 分
              </div>
            </div>
          </div>

          <form action={adjustPointsAction} style={{ marginTop: 10 }}>
            <input type="hidden" name="userId" value={m.user.id} />
            <div className="field-row">
              <label className="field" style={{ width: 100, flex: "none" }}>
                <input name="delta" type="number" placeholder="±分" required />
              </label>
              <label className="field">
                <input name="reason" placeholder="理由（会通知对方）" maxLength={60} required />
              </label>
            </div>
            <button className="btn ghost" type="submit" style={{ width: "100%", marginTop: 8, padding: 10, fontSize: 13 }}>
              调整积分
            </button>
          </form>
        </div>
      ))}

    </>
  );
}
