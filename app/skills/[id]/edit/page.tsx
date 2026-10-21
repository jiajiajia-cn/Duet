import Link from "next/link";
import { redirect } from "next/navigation";
import SkillForm from "@/components/SkillForm";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { updateSkillAction } from "@/app/actions/skills";

export default async function EditSkillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { id } = await params;
  const { error } = await searchParams;

  const skill = await prisma.skill.findFirst({ where: { id, circleId: ctx.circle.id } });
  if (!skill) redirect("/skills");

  return (
    <>
      <header className="header">
        <Link href={`/skills/${id}`} className="tiny">‹ 返回</Link>
        <h1 style={{ fontSize: 19 }}>编辑技能</h1>
      </header>
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
      <SkillForm
        action={updateSkillAction}
        submitLabel="保存"
        defaults={{
          id: skill.id,
          name: skill.name,
          icon: skill.icon,
          color: skill.color,
          description: skill.description,
          targetHours: skill.targetHours,
        }}
      />
    </>
  );
}
