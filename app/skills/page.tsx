import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Mascot from "@/components/Mascot";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";

function levelOf(hours: number) {
  return Math.min(10, Math.floor(hours / 10) + 1);
}

export default async function SkillsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { ok } = await searchParams;

  const skills = await prisma.skill.findMany({
    where: { circleId: ctx.circle.id, ownerId: ctx.user.id },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  const total = skills.reduce((s, k) => s + k.totalSeconds, 0);

  return (
    <>
      <Header title="技能卡片" sub={`共 ${(total / 3600).toFixed(1)} 小时`} avatar={ctx.user.nickname.slice(0, 1)} />

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}

      <Link href="/skills/new" className="btn">
        ＋ 新建技能
      </Link>

      {skills.length === 0 ? (
        <div className="card" style={{ marginTop: 14, textAlign: "center" }}>
          <div style={{ textAlign: "center" }}><Mascot className="mascot mascot-inline" pose="hello" /></div>
        <div style={{ fontSize: 34, marginBottom: 6 }}>🎯</div>
          <b>还没有技能卡片</b>
          <p className="tiny" style={{ margin: "6px 0 0" }}>
            建一个，之后的计时就能归到它上面
          </p>
        </div>
      ) : (
        skills.map((s) => {
          const hours = s.totalSeconds / 3600;
          const pct = s.targetHours ? Math.min(100, (hours / s.targetHours) * 100) : null;
          return (
            <Link key={s.id} href={`/skills/${s.id}`} className="card" style={{ marginTop: 10, opacity: s.status === "ARCHIVED" ? 0.55 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="ico" style={{ width: 44, height: 44, borderRadius: 14, fontSize: 20, background: `${s.color}22` }}>
                  {s.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <b>{s.name}</b>
                    <span className="pill">Lv.{levelOf(hours)}</span>
                    {s.status === "ARCHIVED" ? <span className="pill warn">已归档</span> : null}
                  </div>
                  <div className="tiny" style={{ marginTop: 3 }}>
                    {hours < 1 ? `${Math.round(s.totalSeconds / 60)} 分钟` : `${hours.toFixed(1)} 小时`}
                    {s.targetHours ? ` / 目标 ${s.targetHours} 小时` : ""}
                  </div>
                </div>
                <span className="tiny">›</span>
              </div>
              {pct != null ? (
                <div className="bar" style={{ marginTop: 10 }}>
                  <i style={{ width: `${pct}%`, background: s.color }} />
                </div>
              ) : null}
            </Link>
          );
        })
      )}

    </>
  );
}
