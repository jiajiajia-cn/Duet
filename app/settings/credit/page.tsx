import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { resolveCreditRule } from "@/lib/credit";
import CreditRuleForm from "@/components/CreditRuleForm";
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

      <CreditRuleForm
        action={saveCreditRuleAction}
        rule={rule}
        editable={ctx.role === "OWNER" || ctx.role === "ADMIN"}
      />
    </>
  );
}
