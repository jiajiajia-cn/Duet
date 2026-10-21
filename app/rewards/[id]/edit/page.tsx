import Link from "next/link";
import { redirect } from "next/navigation";
import RewardForm from "@/components/RewardForm";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { updateRewardAction } from "@/app/actions/rewards";

export default async function EditRewardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") redirect("/rewards");

  const { id } = await params;
  const { error } = await searchParams;

  const reward = await prisma.reward.findFirst({ where: { id, circleId: ctx.circle.id } });
  if (!reward) redirect("/admin/rewards");

  const rows = await prisma.reward.findMany({
    where: { circleId: ctx.circle.id },
    select: { category: true },
    distinct: ["category"],
  });

  const images = Array.isArray(reward.images) ? (reward.images as string[]) : [];

  return (
    <>
      <header className="header">
        <Link href="/admin/rewards" className="tiny">
          ‹ 返回
        </Link>
        <h1 style={{ fontSize: 19 }}>编辑奖品</h1>
      </header>

      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      <RewardForm
        action={updateRewardAction}
        categories={rows.map((r) => r.category)}
        submitLabel="保存"
        defaults={{
          id: reward.id,
          title: reward.title,
          description: reward.description,
          pointsCost: reward.pointsCost,
          stock: reward.stock,
          limitPerUser: reward.limitPerUser,
          cooldownDays: reward.cooldownDays,
          category: reward.category,
          fulfillmentType: reward.fulfillmentType,
          image: images[0] ?? null,
        }}
      />
    </>
  );
}
