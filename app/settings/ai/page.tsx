import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { aiConfig } from "@/lib/ai";
import { regenerateAction, saveAiConfigAction, testAiAction } from "@/app/actions/ai";

export default async function AiSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") redirect("/settings");

  const { ok, error } = await searchParams;
  const cfg = aiConfig(ctx.circle.settings);

  const count = await prisma.aiReport.count({ where: { userId: ctx.user.id } }).catch(() => 0);

  return (
    <>
      <Header
        title="AI 回顾"
        sub={cfg.enabled ? `已开启 · ${cfg.model}` : "未开启"}
        back={{ href: "/settings", label: "设置" }}
      />

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      <form action={saveAiConfigAction} className="stack" style={{ gap: 12 }}>
        <label className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} />
          开启每日 AI 回顾
        </label>

        <label className="field">
          <span>API Key（DeepSeek）</span>
          <input
            name="apiKey"
            type="password"
            placeholder={cfg.apiKey ? "已保存，留空表示不修改" : "sk-..."}
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>接口地址</span>
          <input name="baseUrl" defaultValue={cfg.baseUrl} placeholder="https://api.deepseek.com/v1" />
        </label>

        <div className="field-row">
          <label className="field">
            <span>模型</span>
            <input name="model" defaultValue={cfg.model} placeholder="deepseek-chat" />
          </label>
          <label className="field">
            <span>几点之后算当天（0–6）</span>
            <input name="hour" type="number" min={0} max={6} defaultValue={cfg.hour ?? 0} />
          </label>
        </div>

        <button className="btn" type="submit">
          保存
        </button>
      </form>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <form action={testAiAction} style={{ flex: 1 }}>
          <button className="btn ghost" type="submit" style={{ width: "100%", height: 44, fontSize: 13 }}>
            测试连接
          </button>
        </form>
        <form action={regenerateAction} style={{ flex: 1 }}>
          <button className="btn ghost" type="submit" style={{ width: "100%", height: 44, fontSize: 13 }}>
            重新生成今天
          </button>
        </form>
      </div>

      <Link href="/ai" className="btn ghost" style={{ marginTop: 10, textAlign: "center" }}>
        看历史回顾{count ? `（${count} 篇）` : ""}
      </Link>

      <div className="hint" style={{ marginTop: 14, lineHeight: 1.7 }}>
        每天你设的时间之后第一次打开应用，会自动生成前一天的回顾并弹出来，看完关掉。
        <br />
        费用按 DeepSeek 的 token 计费，每天每人一次，一般几分钱。
      </div>
    </>
  );
}
