import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { resolveCreditRule } from "@/lib/credit";
import { saveCreditRuleAction } from "@/app/actions/settings";

export default async function CreditSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { ok } = await searchParams;
  const rule = await resolveCreditRule(prisma, ctx.circle.id, null);
  const tiers = rule?.tiers?.length ? rule.tiers : [];

  return (
    <>
      <header className="header">
        <Link href="/timer" className="tiny">
          ‹ 计时
        </Link>
        <h1 style={{ fontSize: 19 }}>计分规则</h1>
      </header>

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}

      <form action={saveCreditRuleAction} className="stack">
        <label className="field">
          <span>用哪种方式给分</span>
          <select name="mode" defaultValue={rule?.mode ?? "TIER"}>
            <option value="TIER">阶梯表（推荐）：达到多少分钟给多少分</option>
            <option value="PER_MINUTE">按分钟：每 X 分钟给 Y 分</option>
            <option value="PER_SESSION">按次：达标一次给固定分</option>
          </select>
        </label>

        <div className="card" style={{ padding: 12 }}>
          <b style={{ fontSize: 14 }}>阶梯表</b>
          <div className="tiny" style={{ margin: "4px 0 10px" }}>
            取"满足条件的最高一档"。留空的行会被忽略。
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div className="field-row" key={i} style={{ marginBottom: 8 }}>
              <label className="field">
                <input
                  name={`tierMin_${i}`}
                  type="number"
                  min={1}
                  placeholder="分钟"
                  defaultValue={tiers[i]?.minutes ?? ""}
                />
              </label>
              <label className="field">
                <input
                  name={`tierPts_${i}`}
                  type="number"
                  min={0}
                  placeholder="分数"
                  defaultValue={tiers[i]?.points ?? ""}
                />
              </label>
            </div>
          ))}
        </div>

        <div className="field-row">
          <label className="field">
            <span>每多少分钟（按分钟模式）</span>
            <input name="minutesPerUnit" type="number" min={1} defaultValue={rule?.minutesPerUnit ?? 10} />
          </label>
          <label className="field">
            <span>给几分</span>
            <input name="pointsPerUnit" type="number" min={1} defaultValue={rule?.pointsPerUnit ?? 1} />
          </label>
        </div>

        <label className="field">
          <span>达标一次给多少分（按次模式）</span>
          <input name="pointsPerSession" type="number" min={0} defaultValue={rule?.pointsPerSession ?? 10} />
        </label>

        <label className="field">
          <span>最短有效时长（分钟，低于不给分）</span>
          <input name="minMinutes" type="number" min={0} defaultValue={rule?.minMinutes ?? 1} />
        </label>

        <div className="field-row">
          <label className="field">
            <span>单次上限（留空不限）</span>
            <input name="capPerSession" type="number" min={0} defaultValue={rule?.capPerSession ?? ""} placeholder="不限" />
          </label>
          <label className="field">
            <span>单日上限（留空不限）</span>
            <input name="capPerDay" type="number" min={0} defaultValue={rule?.capPerDay ?? ""} placeholder="不限" />
          </label>
        </div>

        {ctx.role === "OWNER" || ctx.role === "ADMIN" ? (
          <button className="btn" type="submit">
            保存
          </button>
        ) : (
          <div className="tiny">只有圈主能改。</div>
        )}
      </form>
    </>
  );
}
