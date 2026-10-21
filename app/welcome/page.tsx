import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { createCircleAction, joinCircleAction } from "@/app/actions/circles";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; join?: string }>;
}) {
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const { error, join } = await searchParams;

  const member = await prisma.circleMember.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { circle: { select: { name: true } } },
  });
  if (member) redirect("/");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } });

  return (
    <div className="auth">
      <div className="auth-logo">
        <span className="only-default">✓</span>
      </div>
      <h1 className="auth-title">先选一个圈子</h1>
      <p className="auth-sub">{user?.nickname}，你可以自己开一个，或者用邀请码加入别人的</p>

      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      <div className="card stack" style={{ gap: 10 }}>
        <b style={{ fontSize: 15 }}>加入别人的圈子</b>
        <form action={joinCircleAction} className="stack" style={{ gap: 8 }}>
          <label className="field">
            <span>邀请码</span>
            <input name="code" maxLength={12} defaultValue={join ?? ""} placeholder="6 位字母数字" required />
          </label>
          <button className="btn" type="submit">
            加入
          </button>
        </form>
      </div>

      <div className="card stack" style={{ gap: 10, marginTop: 12 }}>
        <b style={{ fontSize: 15 }}>自己开一个</b>
        <form action={createCircleAction} className="stack" style={{ gap: 8 }}>
          <label className="field">
            <span>圈子名字</span>
            <input name="name" maxLength={30} defaultValue="小圈子" required />
          </label>
          <button className="btn ghost" type="submit">
            创建
          </button>
        </form>
      </div>

      <div className="auth-foot">
        <Link href="/login">换个账号</Link>
      </div>
    </div>
  );
}
