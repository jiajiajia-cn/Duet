import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { getContext } from "@/lib/queries";
import { localDateString, humanDate } from "@/lib/date";
import { missedDays, unusedCards, makeupPrice } from "@/lib/makeup";
import { buyMakeupCardAction, useMakeupCardAction } from "@/app/actions/makeup";

export default async function MakeupPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { ok, error } = await searchParams;
  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
  const price = makeupPrice(ctx.circle.settings);

  const [cards, missed] = await Promise.all([
    unusedCards(ctx.circle.id, ctx.user.id),
    missedDays({ circleId: ctx.circle.id, userId: ctx.user.id, today }),
  ]);

  const grouped = new Map<string, typeof missed>();
  for (const m of missed) {
    const list = grouped.get(m.date) ?? [];
    list.push(m);
    grouped.set(m.date, list);
  }

  return (
    <>
      <Header
        title="补签"
        sub={cards ? `手上有 ${cards} 张补签卡` : "还没有补签卡"}
        avatar={ctx.user.nickname.slice(0, 1)}
        back={{ href: "/rewards", label: "奖品" }}
      />

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kv">
          <span>我的补签卡</span>
          <b>{cards} 张</b>
        </div>
        <div className="kv">
          <span>单价</span>
          <b>{price ? `${price} 分` : "圈主未开启"}</b>
        </div>
        {price && ctx.user.id ? (
          <form action={buyMakeupCardAction} style={{ marginTop: 10 }}>
            <button className="btn" type="submit" style={{ width: "100%" }}>
              再买一张（{price} 分）
            </button>
          </form>
        ) : null}
      </div>

      {missed.length === 0 ? (
        <div className="empty">最近 7 天没有漏掉的，不需要补签。</div>
      ) : (
        <>
          <div className="section-title">
            <b>可以补的日子</b>
            <span className="tiny">最近 7 天</span>
          </div>

          {cards === 0 ? (
            <div className="alert" style={{ marginBottom: 12 }}>
              先用积分买一张补签卡，才能补。
            </div>
          ) : null}

          {Array.from(grouped.entries()).map(([date, items]) => (
            <div key={date} className="card" style={{ marginBottom: 10 }}>
              <div className="tiny" style={{ marginBottom: 6 }}>
                {humanDate(date)} · 漏了 {items.length} 件
              </div>
              {items.map((m) => (
                <div key={`${m.habitId}-${m.date}`} className="kv">
                  <span>
                    {m.icon} {m.title}
                  </span>
                  <form action={useMakeupCardAction}>
                    <input type="hidden" name="habitId" value={m.habitId} />
                    <input type="hidden" name="date" value={m.date} />
                    <button
                      className="btn ghost"
                      type="submit"
                      disabled={cards === 0}
                      style={{ width: "auto", padding: "6px 12px", fontSize: 12 }}
                    >
                      用一张补上
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      <div className="hint" style={{ marginTop: 14 }}>
        补签只恢复连续天数，不给积分。
      </div>

      <Link href="/rewards" className="btn ghost" style={{ marginTop: 14, textAlign: "center" }}>
        回奖品页
      </Link>
    </>
  );
}
