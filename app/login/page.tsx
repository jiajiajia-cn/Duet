import Link from "next/link";
import Mascot from "@/components/Mascot";
import { loginAction } from "@/app/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; join?: string }>;
}) {
  const { error, join } = await searchParams;

  return (
    <div className="auth">
      <div className="auth-logo">
        <span className="only-default">✓</span>
        <Mascot className="mascot auth-mascot" pose="hello" />
      </div>
      <h1 className="auth-title">签到</h1>
      <p className="auth-sub">打卡 · 计时 · 换奖励</p>

      <form action={loginAction} className="auth-form">
        {join ? <input type="hidden" name="join" value={join} /> : null}
        <label className="field">
          <span>邮箱</span>
          <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
        </label>
        <label className="field">
          <span>密码</span>
          <input name="password" type="password" autoComplete="current-password" placeholder="至少 8 位" required />
        </label>
        {error ? <div className="alert">{error}</div> : null}
        <button className="btn" type="submit">
          登录
        </button>
      </form>

      <div className="auth-foot">
        还没有账号？<Link href={join ? `/register?join=${join}` : "/register"}>注册一个</Link>
      </div>
    </div>
  );
}
