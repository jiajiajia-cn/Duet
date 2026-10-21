import Link from "next/link";
import { redirect } from "next/navigation";
import SkillForm from "@/components/SkillForm";
import { getContext } from "@/lib/queries";
import { createSkillAction } from "@/app/actions/skills";

export default async function NewSkillPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const { error } = await searchParams;

  return (
    <>
      <header className="header">
        <Link href="/skills" className="tiny">‹ 技能</Link>
        <h1 style={{ fontSize: 19 }}>新建技能</h1>
      </header>
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
      <SkillForm action={createSkillAction} submitLabel="创建" />
    </>
  );
}
