import Link from "next/link";
import { redirect } from "next/navigation";
import RewardForm from "@/components/RewardForm";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { createRewardAction } from "@/app/actions/rewards";

export default async function NewRewardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { error } = await searchParams;
  const rows = await prisma.reward.findMany({
    where: { circleId: ctx.circle.id },
    select: { category: true },
    distinct: ["category"],
  });

  return (
    <>
      <header className="header">
        <Link href="/admin/rewards" className="tiny">
          ‹ 返回
        </Link>
        <h1 style={{ fontSize: 19 }}>上架奖品</h1>
      </header>

      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      <RewardForm
        action={createRewardAction}
        categories={rows.map((r) => r.category)}
        submitLabel="上架"
      />
    </>
  );
}
