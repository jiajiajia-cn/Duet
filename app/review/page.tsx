import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { localDateString } from "@/lib/date";
import { approveCheckinAction, nudgeAction, rejectCheckinAction } from "@/app/actions/review";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { ok, error } = await searchParams;
  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);

  const [pending, members, todays] = await Promise.all([
    prisma.checkin.findMany({
      where: { habit: { circleId: ctx.circle.id }, status: "PENDING" },
      orderBy: { checkedAt: "desc" },
      include: { habit: { select: { title: true, icon: true } }, user: { select: { nickname: true } } },
    }),
    prisma.circleMember.findMany({
      where: { circleId: ctx.circle.id, status: "ACTIVE" },
      include: { user: { select: { id: true, nickname: true } } },
    }),
    prisma.checkin.findMany({
      where: {
        localDate: today,
        habit: { circleId: ctx.circle.id },
        status: { in: ["APPROVED", "PENDING"] },
      },
      select: { userId: true },
    }),
  ]);

  const doneSet = new Set(todays.map((t) => t.userId));

  return (
    <>
      <Header title="待确认" sub={`${pending.length} 条等你点头`} avatar={ctx.user.nickname.slice(0, 1)} />

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      {pending.length === 0 ? (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 6 }}>✅</div>
          <b>没有待确认的打卡</b>
        </div>
      ) : (
        pending.map((c) => (
          <div key={c.id} className="card" style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="ico" style={{ width: 38, height: 38, borderRadius: 12, fontSize: 17 }}>{c.habit.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>
                  {c.user.nickname} · {c.habit.title}
                </div>
                <div className="tiny" style={{ marginTop: 2 }}>
                  {new Date(c.checkedAt).toLocaleString("zh-CN", { timeZone: ctx.user.timezone, hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {c.note ? ` · ${c.note}` : ""}
                </div>
              </div>
            </div>

            {Array.isArray(c.images) && (c.images as string[]).length ? (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {(c.images as string[]).slice(0, 3).map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt="" style={{ width: 68, height: 68, objectFit: "cover", borderRadius: 10 }} />
                ))}
              </div>
            ) : null}

            {c.userId !== ctx.user.id ? (
              <>
                <form action={approveCheckinAction} style={{ marginTop: 10 }}>
                  <input type="hidden" name="checkinId" value={c.id} />
                  <button className="btn" type="submit" style={{ padding: 11, fontSize: 14 }}>
                    确认，给他加分
                  </button>
                </form>
                <form action={rejectCheckinAction} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input type="hidden" name="checkinId" value={c.id} />
                  <input
                    name="reason"
                    placeholder="驳回理由（会通知对方）"
                    defaultValue=""
                    maxLength={100}
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line)", fontSize: 13 }}
                  />
                  <button className="btn ghost" type="submit" style={{ width: 80, flex: "none", padding: 10, fontSize: 13 }}>
                    驳回
                  </button>
                </form>
              </>
            ) : (
              <div className="tiny" style={{ marginTop: 8 }}>等圈主确认中…</div>
            )}
          </div>
        ))
      )}

      <div className="section-title">
        <b>今天还没打卡</b>
        <span className="tiny">可以催一下</span>
      </div>
      {members.filter((m) => !doneSet.has(m.user.id)).length === 0 ? (
        <div className="empty">今天大家都打了。</div>
      ) : (
        members
          .filter((m) => !doneSet.has(m.user.id))
          .map((m) => (
            <div key={m.id} className="habit">
              <div className="avatar" style={{ width: 34, height: 34, borderRadius: 11, fontSize: 14 }}>
                {m.user.nickname.slice(0, 1)}
              </div>
              <div className="meta">
                <div className="name">{m.user.nickname}</div>
                <div className="sub">今天一次都没打卡</div>
              </div>
              <form action={nudgeAction}>
                <input type="hidden" name="userId" value={m.user.id} />
                <input type="hidden" name="title" value="今天还没打卡，去补一下" />
                <button className="btn ghost" type="submit" style={{ width: "auto", padding: "8px 12px", fontSize: 13 }}>
                  催一下
                </button>
              </form>
            </div>
          ))
      )}

      <Link href="/notifications" className="btn ghost" style={{ marginTop: 12, textAlign: "center" }}>
        看我的通知
      </Link>
    </>
  );
}
