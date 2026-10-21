import Link from "next/link";
import { redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import Header from "@/components/Header";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { updateCircleAction, updateProfileAction } from "@/app/actions/profile";
import {
  createCircleAction,
  joinCircleAction,
  leaveCircleAction,
  switchCircleAction,
} from "@/app/actions/circles";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { ok, error } = await searchParams;
  const isAdmin = ctx.role === "OWNER" || ctx.role === "ADMIN";

  const [members, wallet, counts, myCircles] = await Promise.all([
    prisma.circleMember.findMany({
      where: { circleId: ctx.circle.id, status: "ACTIVE" },
      include: { user: { select: { id: true, nickname: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.wallet.findUnique({
      where: { circleId_userId: { circleId: ctx.circle.id, userId: ctx.user.id } },
    }),
    Promise.all([
      prisma.habit.count({ where: { circleId: ctx.circle.id, ownerId: ctx.user.id, status: "ACTIVE" } }),
      prisma.reward.count({ where: { circleId: ctx.circle.id, status: "ACTIVE" } }),
      prisma.redemption.count({ where: { circleId: ctx.circle.id, status: "APPROVED" } }),
      prisma.checkin.count({ where: { habit: { circleId: ctx.circle.id }, status: "PENDING" } }),
      prisma.notification.count({ where: { userId: ctx.user.id, readAt: null } }),
    ]),
    prisma.circleMember.findMany({
      where: { userId: ctx.user.id, status: "ACTIVE" },
      include: { circle: { select: { name: true } } },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  return (
    <>
      <Header title="设置" sub="规则 · 圈子 · 账号" avatar={ctx.user.nickname.slice(0, 1)} />

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      <div className="settings-group">
        <div className="section-title"><b>外观</b></div>
        <Link href="/settings/theme" className="settings-row">
          <span className="ico">🎨</span>
          <span style={{ flex: 1 }}>
            <b>主题</b>
            <em>线条小狗 / 黑 / 白 / 绿 / 蓝 / 粉</em>
          </span>
          <span className="tiny">›</span>
        </Link>
      </div>

      <div className="settings-group">
        <div className="section-title"><b>规则</b></div>
        <Link href="/settings/credit" className="settings-row">
          <span className="ico">⏱</span>
          <span style={{ flex: 1 }}>
            <b>计时计分规则</b>
            <em>你自己定</em>
          </span>
          <span className="tiny">›</span>
        </Link>
        <Link href="/skills" className="settings-row">
          <span className="ico">🎯</span>
          <span style={{ flex: 1 }}>
            <b>技能卡片</b>
            <em>时间归到哪</em>
          </span>
          <span className="tiny">›</span>
        </Link>
        <Link href="/habits" className="settings-row">
          <span className="ico">✅</span>
          <span style={{ flex: 1 }}>
            <b>习惯与积分</b>
            <em>{counts[0]} 个进行中的习惯</em>
          </span>
          <span className="tiny">›</span>
        </Link>
      </div>

      <div className="settings-group">
        <div className="section-title"><b>日程与专注</b></div>
        <Link href="/schedule" className="settings-row">
          <span className="ico">📅</span>
          <span style={{ flex: 1 }}>
            <b>日程表</b>
            <em>今天和接下来几天的安排</em>
          </span>
          <span className="tiny">›</span>
        </Link>
        <Link href="/rooms" className="settings-row">
          <span className="ico">👥</span>
          <span style={{ flex: 1 }}>
            <b>自习室</b>
            <em>共同倒计时</em>
          </span>
          <span className="tiny">›</span>
        </Link>
        <Link href="/backfill" className="settings-row">
          <span className="ico">🩹</span>
          <span style={{ flex: 1 }}>
            <b>补打卡</b>
            <em>补最近 7 天，不计连续</em>
          </span>
          <span className="tiny">›</span>
        </Link>
      </div>

      <div className="settings-group">
        <div className="section-title"><b>协作</b></div>
        <Link href="/review" className="settings-row">
          <span className="ico">👀</span>
          <span style={{ flex: 1 }}>
            <b>待确认</b>
            <em>{counts[3] > 0 ? `${counts[3]} 条等你点头` : "没有待确认的打卡"}</em>
          </span>
          <span className="tiny">›</span>
        </Link>
        <Link href="/notifications" className="settings-row">
          <span className="ico">🔔</span>
          <span style={{ flex: 1 }}>
            <b>通知</b>
            <em>{counts[4] > 0 ? `${counts[4]} 条未读` : "没有未读"}</em>
          </span>
          <span className="tiny">›</span>
        </Link>
        {isAdmin ? (
          <Link href="/admin/members" className="settings-row">
            <span className="ico">👤</span>
            <span style={{ flex: 1 }}>
              <b>成员与积分</b>
              <em>加 / 扣分</em>
            </span>
            <span className="tiny">›</span>
          </Link>
        ) : null}
      </div>

      <div className="settings-group">
        <div className="section-title"><b>奖品</b></div>
        <Link href="/admin/rewards" className="settings-row">
          <span className="ico">🎁</span>
          <span style={{ flex: 1 }}>
            <b>奖品管理</b>
            <em>{counts[1]} 个在架奖品</em>
          </span>
          <span className="tiny">›</span>
        </Link>
        <Link href="/admin/orders" className="settings-row">
          <span className="ico">🧾</span>
          <span style={{ flex: 1 }}>
            <b>兑换管理</b>
            <em>{counts[2]} 单待发放</em>
          </span>
          <span className="tiny">›</span>
        </Link>
      </div>

      <div className="settings-group">
        <div className="section-title"><b>圈子</b></div>

        <div className="card">
          <div className="tiny" style={{ marginBottom: 6 }}>我加入的</div>
          {myCircles.map((c) => (
            <div key={c.circleId} className="kv">
              <span>
                {c.circle.name}
                {c.circleId === ctx.circle.id ? " · 当前" : ""}
              </span>
              {c.circleId === ctx.circle.id ? (
                <b>{c.role === "OWNER" ? "圈主" : "成员"}</b>
              ) : (
                <form action={switchCircleAction}>
                  <input type="hidden" name="circleId" value={c.circleId} />
                  <button className="btn ghost" type="submit" style={{ width: "auto", padding: "6px 12px", fontSize: 12 }}>
                    切换
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 10 }}>
          <div className="tiny" style={{ marginBottom: 6 }}>当前圈子</div>
          {isAdmin ? (
            <form action={updateCircleAction} className="stack" style={{ gap: 10 }}>
              <label className="field">
                <span>圈子名字</span>
                <input name="name" defaultValue={ctx.circle.name} maxLength={30} />
              </label>
              <div className="kv">
                <span>邀请码</span>
                <b style={{ letterSpacing: 2, fontFamily: "ui-monospace, monospace" }}>
                  {ctx.circle.inviteCode}
                </b>
              </div>
              <label className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" name="rotate" /> 换一个新邀请码
              </label>
              <button className="btn ghost" type="submit">
                保存圈子
              </button>
            </form>
          ) : (
            <div className="kv">
              <span>邀请码</span>
              <b style={{ letterSpacing: 2 }}>{ctx.circle.inviteCode}</b>
            </div>
          )}

          <div className="tiny" style={{ margin: "10px 0 4px" }}>
            邀请链接：
            <Link href={`/join/${ctx.circle.inviteCode}`} style={{ color: "var(--brand)" }}>
              /join/{ctx.circle.inviteCode}
            </Link>
          </div>

          <div style={{ marginTop: 10 }}>
            {members.map((m) => (
              <div key={m.id} className="kv">
                <span>{m.user.nickname}</span>
                <b>{m.role === "OWNER" ? "圈主" : m.role === "ADMIN" ? "管理员" : m.role === "SUPERVISOR" ? "监督人" : "成员"}</b>
              </div>
            ))}
          </div>

          {ctx.role !== "OWNER" ? (
            <form action={leaveCircleAction} style={{ marginTop: 10 }}>
              <input type="hidden" name="circleId" value={ctx.circle.id} />
              <button className="btn ghost" type="submit" style={{ width: "100%", padding: 10, fontSize: 13, color: "var(--danger)" }}>
                退出这个圈子
              </button>
            </form>
          ) : null}
        </div>

        <div className="card" style={{ marginTop: 10 }}>
          <div className="tiny" style={{ marginBottom: 6 }}>加入别的圈子 / 自己再开一个</div>
          <form action={joinCircleAction} style={{ display: "flex", gap: 8 }}>
            <input
              name="code"
              maxLength={12}
              placeholder="输入邀请码"
              style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--input-bg)", fontSize: 14 }}
            />
            <button className="btn ghost" type="submit" style={{ width: "auto", padding: "10px 14px", fontSize: 13 }}>
              加入
            </button>
          </form>
          <form action={createCircleAction} style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              name="name"
              maxLength={30}
              placeholder="新圈子名字"
              defaultValue="小圈子"
              style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--input-bg)", fontSize: 14 }}
            />
            <button className="btn ghost" type="submit" style={{ width: "auto", padding: "10px 14px", fontSize: 13 }}>
              新建
            </button>
          </form>
        </div>
      </div>

      <div className="settings-group">
        <div className="section-title"><b>账号</b></div>
        <div className="card">
          <form action={updateProfileAction} className="stack" style={{ gap: 10 }} encType="multipart/form-data">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar url={ctx.user.avatarUrl} name={ctx.user.nickname} size={56} radius={18} />
              <label className="field" style={{ flex: 1 }}>
                <span>换头像（jpg / png / webp，≤5MB）</span>
                <input type="file" name="avatar" accept="image/*" />
              </label>
            </div>
            <label className="field">
              <span>昵称</span>
              <input name="nickname" defaultValue={ctx.user.nickname} maxLength={20} />
            </label>
            <div className="field-row">
              <label className="field">
                <span>时区</span>
                <input name="timezone" defaultValue={ctx.user.timezone} />
              </label>
              <label className="field">
                <span>日切时间（凌晨几点算前一天）</span>
                <input name="dayStartHour" type="number" min={0} max={6} defaultValue={ctx.user.dayStartHour} />
              </label>
            </div>
            <div className="kv">
              <span>当前积分</span>
              <b>{(wallet?.balance ?? 0).toLocaleString()} 分</b>
            </div>
            <button className="btn ghost" type="submit">
              保存账号
            </button>
          </form>
        </div>
      </div>

      <div className="settings-group">
        <div className="section-title"><b>数据</b></div>
        <a href="/api/export?format=json" className="settings-row">
          <span className="ico">📦</span>
          <span style={{ flex: 1 }}>
            <b>导出全部数据（JSON）</b>
            <em>备份用，包含打卡、计时、流水、兑换</em>
          </span>
          <span className="tiny">下载</span>
        </a>
        <a href="/api/export?format=csv" className="settings-row">
          <span className="ico">📄</span>
          <span style={{ flex: 1 }}>
            <b>导出打卡记录（CSV）</b>
            <em>可以丢进 Excel 看</em>
          </span>
          <span className="tiny">下载</span>
        </a>
      </div>

    </>
  );
}
