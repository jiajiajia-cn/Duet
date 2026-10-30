import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { aiConfig } from "@/lib/ai";
import { generateWeeklyAction } from "@/app/actions/ai";
import { computeInsights } from "@/lib/insights";
import { detectInsights, pickForSurface, KIND_LABEL } from "@/lib/insight-engine";
import { localDateString } from "@/lib/date";

export default async function AiHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { ok, error } = await searchParams;
  const cfg = aiConfig(ctx.circle.settings);

  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
  const insight = await computeInsights({
    circleId: ctx.circle.id,
    userId: ctx.user.id,
    today,
    timezone: ctx.user.timezone,
    days: 30,
  }).catch(() => null);

  const candidates = insight ? detectInsights(insight) : [];
  const picked = pickForSurface(candidates, "page");

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

      {insight && insight.overallRate > 0 ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <b>数据里的规律</b>
            <span className="tiny">最近 30 天</span>
          </div>

          <div className="kv">
            <span>总体完成率</span>
            <b>
              {insight.overallRate}%
              <span className="tiny" style={{ marginLeft: 6, color: insight.trend.diff >= 0 ? "var(--ok)" : "var(--danger)" }}>
                {insight.trend.diff >= 0 ? "+" : ""}
                {insight.trend.diff} vs 上周
              </span>
            </b>
          </div>

          {insight.bestDay ? (
            <div className="kv">
              <span>最稳的一天</span>
              <b>
                {insight.bestDay.label} · {insight.bestDay.rate}%
              </b>
            </div>
          ) : null}

          {insight.worstDay && insight.worstDay.label !== insight.bestDay?.label ? (
            <div className="kv">
              <span>最容易崩的一天</span>
              <b style={{ color: "var(--danger)" }}>
                {insight.worstDay.label} · {insight.worstDay.rate}%
              </b>
            </div>
          ) : null}

          {insight.fragile.length ? (
            <div className="kv">
              <span>最容易断</span>
              <b style={{ textAlign: "right" }}>
                {insight.fragile.map((f) => `${f.title} ${f.rate}%`).join("、")}
              </b>
            </div>
          ) : null}

          {insight.strongest.length ? (
            <div className="kv">
              <span>最稳定</span>
              <b style={{ textAlign: "right" }}>
                {insight.strongest.map((f) => `${f.title} ${f.rate}%`).join("、")}
              </b>
            </div>
          ) : null}

          {insight.avgHour != null ? (
            <div className="kv">
              <span>平均打卡时间</span>
              <b>{insight.avgHour} 点</b>
            </div>
          ) : null}

          {insight.focusMinutes ? (
            <div className="kv">
              <span>专注总时长</span>
              <b>
                {insight.focusMinutes} 分钟
                {insight.topSkill ? ` · ${insight.topSkill.name}` : ""}
              </b>
            </div>
          ) : null}

          {picked.length ? (
            <div style={{ marginTop: 14 }}>
              <div className="tiny" style={{ fontWeight: 700, marginBottom: 8 }}>
                值得注意的
              </div>
              {picked.map((x, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div className="tiny" style={{ color: "var(--brand)", fontWeight: 700, marginBottom: 3 }}>
                    {KIND_LABEL[x.kind]}
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.65 }}>{x.text}</div>
                  {x.action ? (
                    <div className="tiny" style={{ marginTop: 3, lineHeight: 1.6 }}>
                      → {x.action}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="tiny" style={{ marginTop: 14, lineHeight: 1.6 }}>
              还没有足够可靠的规律。再记几天，等数据能撑住结论了它才会说。
            </div>
          )}
          <div className="tiny" style={{ marginTop: 12, lineHeight: 1.6 }}>
            这些都是按你的记录算出来的，不是 AI 编的。点下面的「生成这周的总结」会让 AI 解读它们。
          </div>
        </div>
      ) : null}

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
