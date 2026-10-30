import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { aiConfig } from "@/lib/ai";
import { generateWeeklyAction } from "@/app/actions/ai";

export default async function AiHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { ok, error } = await searchParams;
  const cfg = aiConfig(ctx.circle.settings);

  const reports = await prisma.aiReport
    .findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    })
    .catch(() => []);

  return (
    <>
      <Header
        title="AI 回顾"
        sub={reports.length ? `${reports.length} 篇` : "还没有"}
        back={{ href: "/me", label: "我的" }}
      />

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      {!cfg.enabled ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="tiny" style={{ lineHeight: 1.6 }}>
            AI 回顾还没开启。圈主可以在「设置 → AI 回顾」里填一个 DeepSeek 的 Key。
          </div>
        </div>
      ) : (
        <form action={generateWeeklyAction} style={{ marginBottom: 12 }}>
          <button className="btn ghost" type="submit" style={{ width: "100%", height: 44, fontSize: 13 }}>
            生成这周的总结
          </button>
        </form>
      )}

      {reports.length === 0 ? (
        <div className="empty">还没有回顾。开了 AI 之后，每天晚上会自动生成一篇。</div>
      ) : (
        reports.map((r) => (
          <div key={r.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <b style={{ fontSize: 14 }}>{r.kind === "WEEKLY" ? "周总结" : "日报"}</b>
              <span className="tiny">{r.date}</span>
            </div>
            {r.content.split("\n").filter(Boolean).map((p, i) => (
              <p key={i} className="tiny" style={{ lineHeight: 1.75, marginBottom: 6 }}>
                {p}
              </p>
            ))}
            {r.model === "fallback" ? (
              <div className="tiny" style={{ opacity: 0.6, marginTop: 4 }}>
                （AI 未连上时生成的简版）
              </div>
            ) : null}
          </div>
        ))
      )}

      <Link href="/settings/ai" className="btn ghost" style={{ marginTop: 12, textAlign: "center" }}>
        去设置
      </Link>
    </>
  );
}
