import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { readAllNotificationsAction } from "@/app/actions/review";

const TYPE_TEXT: Record<string, string> = {
  HABIT_REMIND: "习惯提醒",
  MISSED: "漏打卡",
  NUDGE: "催办",
  CHECKIN_REVIEW: "打卡确认",
  REDEEM_UPDATE: "兑换进展",
  REDEEM_INVITE: "合兑邀请",
  TIMER_END: "计时结束",
  MILESTONE: "里程碑",
  SYSTEM: "系统",
};

export default async function NotificationsPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const list = await prisma.notification.findMany({
    where: { userId: ctx.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unread = list.filter((n) => !n.readAt).length;

  return (
    <>
      <Header title="通知" sub={unread ? `${unread} 条未读` : "都看过了"} avatar={ctx.user.nickname.slice(0, 1)} />

      {list.length === 0 ? (
        <div className="empty">还没有通知。</div>
      ) : (
        <>
          {unread > 0 ? (
            <form action={readAllNotificationsAction}>
              <button className="btn ghost" type="submit" style={{ marginBottom: 12 }}>
                全部标为已读
              </button>
            </form>
          ) : null}

          {list.map((n) => (
            <Link key={n.id} href={n.link ?? "/"} className="card" style={{ marginTop: 10, display: "block", opacity: n.readAt ? 0.65 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="pill">{TYPE_TEXT[n.type] ?? n.type}</span>
                {!n.readAt ? <span className="pill warn">未读</span> : null}
                <span className="tiny" style={{ marginLeft: "auto" }}>
                  {new Date(n.createdAt).toLocaleString("zh-CN", { timeZone: ctx.user.timezone, hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div style={{ fontWeight: 600, marginTop: 6 }}>{n.title}</div>
              {n.body ? <div className="tiny" style={{ marginTop: 3, lineHeight: 1.5 }}>{n.body}</div> : null}
            </Link>
          ))}
        </>
      )}

      <Link href="/review" className="btn ghost" style={{ marginTop: 14, textAlign: "center" }}>
        去「待确认」
      </Link>
    </>
  );
}
