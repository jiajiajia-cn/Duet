import Link from "next/link";
import { redirect } from "next/navigation";
import HabitForm from "@/components/HabitForm";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { createHabitAction } from "@/app/actions/habits";

export default async function NewHabitPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { error } = await searchParams;
  const skills = await prisma.skill.findMany({
    where: { circleId: ctx.circle.id, ownerId: ctx.user.id, status: "ACTIVE" },
    select: { id: true, name: true, icon: true },
  });

  return (
    <>
      <header className="header">
        <Link href="/habits" className="tiny">
          ‹ 习惯
        </Link>
        <h1 style={{ fontSize: 19 }}>新建习惯</h1>
      </header>

      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      <HabitForm action={createHabitAction} skills={skills} submitLabel="创建" />
    </>
  );
}
