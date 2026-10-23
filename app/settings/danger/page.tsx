import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { resetDataAction } from "@/app/actions/reset";

export default async function DangerPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") redirect("/settings");

  const { ok, error } = await searchParams;
  const circleId = ctx.circle.id;

  const [checkins, txns, sessions, redemptions, cards] = await Promise.all([
    prisma.checkin.count({ where: { habit: { circleId } } }),
    prisma.pointTxn.count({ where: { wallet: { circleId } } }),
    prisma.timerSession.count({ where: { circleId } }),
    prisma.redemption.count({ where: { circleId } }),
    prisma.makeupCard.count({ where: { circleId } }).catch(() => 0),
  ]);

  const blocks = [
    {
      scope: "checkins",
      title: "打卡记录",
      count: checkins,
      desc: "所有打卡、连续天数、热力图。习惯本身保留。",
    },
    {
      scope: "points",
      title: "积分流水",
      count: txns,
      desc: "所有积分变动记录，并把每个人的余额归零。",
    },
    {
      scope: "timers",
      title: "计时记录",
      count: sessions,
      desc: "专注时长的历史，技能累计时长也会受影响。",
    },
    {
      scope: "redemptions",
      title: "兑换记录",
      count: redemptions,
      desc: "所有兑换单、合兑、发放状态。奖品本身保留。",
    },
  ];

  return (
    <>
      <Header
        title="清空记录"
        sub="不可恢复，操作前建议先导出备份"
        avatar={ctx.user.nickname.slice(0, 1)}
        back={{ href: "/settings", label: "设置" }}
      />

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="tiny" style={{ lineHeight: 1.6 }}>
          建议先导出一份备份留底，再清空。
        </div>
        <Link href="/api/export" className="btn ghost" style={{ marginTop: 10, height: 44, fontSize: 14 }}>
          导出数据（JSON / CSV）
        </Link>
      </div>

      {blocks.map((b) => (
        <div key={b.scope} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <b style={{ fontSize: 15 }}>{b.title}</b>
            <span className="tiny">{b.count} 条</span>
          </div>
          <div className="tiny" style={{ margin: "4px 0 10px", lineHeight: 1.5 }}>
            {b.desc}
          </div>
          <form action={resetDataAction} className="stack" style={{ gap: 8 }}>
            <input type="hidden" name="scope" value={b.scope} />
            <div style={{ display: "flex", gap: 8 }}>
              <input
                name="confirm"
                placeholder="输入「清空」确认"
                style={{
                  flex: 1,
                  height: 42,
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  background: "var(--input-bg)",
                  padding: "0 12px",
                  fontSize: 14,
                }}
              />
              <button
                className="btn ghost"
                type="submit"
                disabled={b.count === 0}
                style={{ width: "auto", padding: "0 14px", height: 42, fontSize: 13, color: b.count ? "var(--danger)" : undefined }}
              >
                清空
              </button>
            </div>
          </form>
        </div>
      ))}

      <div className="card" style={{ marginTop: 14, borderColor: "var(--danger)" }}>
        <b style={{ fontSize: 15, color: "var(--danger)" }}>清空全部记录</b>
        <div className="tiny" style={{ margin: "4px 0 10px", lineHeight: 1.5 }}>
          打卡、积分、计时、兑换、补签卡一起清掉，积分归零。
          <br />
          账号、圈子、习惯、奖品、日程都会保留。{cards > 0 ? `（还有 ${cards} 张补签卡会被清掉）` : ""}
        </div>
        <form action={resetDataAction} className="stack" style={{ gap: 8 }}>
          <input type="hidden" name="scope" value="all" />
          <div style={{ display: "flex", gap: 8 }}>
            <input
              name="confirm"
              placeholder="输入「清空」确认"
              style={{
                flex: 1,
                height: 42,
                borderRadius: 12,
                border: "1px solid var(--line)",
                background: "var(--input-bg)",
                padding: "0 12px",
                fontSize: 14,
              }}
            />
            <button
              className="btn"
              type="submit"
              style={{ width: "auto", padding: "0 14px", height: 42, fontSize: 13, background: "var(--danger)", color: "#fff" }}
            >
              全部清空
            </button>
          </div>
        </form>
      </div>

      <div className="hint" style={{ marginTop: 14, lineHeight: 1.6 }}>
        清空是不可恢复的。服务器上每天 3:30 会自动备份一份，真误删了可以从
        <b> data/backup </b> 里找回。
      </div>
    </>
  );
}
