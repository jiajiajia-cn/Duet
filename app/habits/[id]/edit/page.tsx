import Link from "next/link";
import { redirect } from "next/navigation";
import HabitForm from "@/components/HabitForm";
import { habitDefaultsOf } from "@/lib/habit-defaults";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { setHabitStatusAction, updateHabitAction } from "@/app/actions/habits";

export default async function EditHabitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { id } = await params;
  const { error, ok } = await searchParams;

  const habit = await prisma.habit.findFirst({ where: { id, circleId: ctx.circle.id } });
  if (!habit) redirect("/habits");

  const [skills, stat] = await Promise.all([
    prisma.skill.findMany({
      where: { circleId: ctx.circle.id, ownerId: ctx.user.id, status: "ACTIVE" },
      select: { id: true, name: true, icon: true },
    }),
    prisma.habitStat.findFirst({ where: { habitId: habit.id, userId: ctx.user.id } }),
  ]);

  return (
    <>
      <header className="header">
        <Link href="/habits" className="tiny">
          ‹ 习惯
        </Link>
        <h1 style={{ fontSize: 19 }}>编辑习惯</h1>
      </header>

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kv">
          <span>当前连续</span>
          <b>{stat?.currentStreak ?? 0} 天</b>
        </div>
        <div className="kv">
          <span>最长连续</span>
          <b>{stat?.bestStreak ?? 0} 天</b>
        </div>
        <div className="kv">
          <span>累计完成</span>
          <b>{stat?.totalDone ?? 0} 次</b>
        </div>
        <div className="kv">
          <span>状态</span>
          <b>{habit.status === "ACTIVE" ? "进行中" : habit.status === "PAUSED" ? "已暂停" : "已归档"}</b>
        </div>
      </div>

      <HabitForm
        action={updateHabitAction}
        defaults={habitDefaultsOf(habit)}
        skills={skills}
        submitLabel="保存修改"
      />

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <form action={setHabitStatusAction} style={{ flex: 1 }}>
          <input type="hidden" name="id" value={habit.id} />
          <input type="hidden" name="status" value={habit.status === "PAUSED" ? "ACTIVE" : "PAUSED"} />
          <button className="btn ghost" type="submit" style={{ width: "100%", padding: 11, fontSize: 14 }}>
            {habit.status === "PAUSED" ? "恢复" : "暂停"}
          </button>
        </form>
        <form action={setHabitStatusAction} style={{ flex: 1 }}>
          <input type="hidden" name="id" value={habit.id} />
          <input type="hidden" name="status" value="ARCHIVED" />
          <button className="btn ghost" type="submit" style={{ width: "100%", padding: 11, fontSize: 14 }}>
            归档
          </button>
        </form>
      </div>

    </>
  );
}
