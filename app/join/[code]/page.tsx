import Link from "next/link";

import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { joinCircleAction } from "@/app/actions/circles";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const { error } = await searchParams;
  const userId = await getUserId();

  const circle = await prisma.circle.findUnique({
    where: { inviteCode: code.toLowerCase() },
    select: {
      id: true,
      name: true,
      inviteCode: true,
      _count: { select: { members: true } },
    },
  });

  if (!circle) {
    return (
      <div className="auth">
        <h1 className="auth-title">邀请码无效</h1>
        <p className="auth-sub">这个邀请码不存在，或者已经被换掉了</p>
        <Link href="/login" className="btn">
          去登录
        </Link>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="auth">
        <h1 className="auth-title">加入「{circle.name}」</h1>
        <p className="auth-sub">{circle._count.members} 个人已经在里面了</p>
        <Link href={`/register?join=${circle.inviteCode}`} className="btn">
          注册并加入
        </Link>
        <Link href={`/login?join=${circle.inviteCode}`} className="btn ghost" style={{ marginTop: 10, textAlign: "center" }}>
          已有账号，登录后加入
        </Link>
      </div>
    );
  }

  const member = await prisma.circleMember.findFirst({
    where: { userId, circleId: circle.id, status: "ACTIVE" },
  });

  return (
    <div className="auth">
      <h1 className="auth-title">加入「{circle.name}」</h1>
      <p className="auth-sub">{circle._count.members} 个人已经在里面了</p>

      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      {member ? (
        <>
          <div className="alert ok" style={{ marginBottom: 12 }}>你已经在这个圈子里</div>
          <Link href="/" className="btn">
            进入
          </Link>
        </>
      ) : (
        <form action={joinCircleAction}>
          <input type="hidden" name="code" value={circle.inviteCode} />
          <button className="btn" type="submit">
            加入
          </button>
        </form>
      )}

      <div className="auth-foot">
        <Link href="/">先看看</Link>
      </div>
    </div>
  );
}
