import Link from "next/link";
import { registerAction } from "@/app/actions/auth";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; join?: string }>;
}) {
  const { error, join } = await searchParams;

  return (
    <div className="auth">
      <div className="auth-logo">✓</div>
      <h1 className="auth-title">创建账号</h1>
      <p className="auth-sub">{join ? "注册后直接加入邀请你的圈子" : "注册后可以先建圈子或用邀请码加入"}</p>

      <form action={registerAction} className="auth-form">
        {join ? <input type="hidden" name="join" value={join} /> : null}
        <label className="field">
          <span>昵称</span>
          <input name="nickname" maxLength={20} placeholder="小满" required />
        </label>
        <label className="field">
          <span>邮箱</span>
          <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
        </label>
        <label className="field">
          <span>密码</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="至少 8 位"
            minLength={8}
            required
          />
        </label>
        {error ? <div className="alert">{error}</div> : null}
        <button className="btn" type="submit">
          注册并进入
        </button>
      </form>

      <div className="auth-foot">
        已经有账号了？<Link href="/login">直接登录</Link>
      </div>
    </div>
  );
}
