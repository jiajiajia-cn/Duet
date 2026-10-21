import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Mascot from "@/components/Mascot";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import { createRoomAction, joinRoomAction } from "@/app/actions/rooms";

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const { error } = await searchParams;

  const rooms = await prisma.room.findMany({
    where: { circleId: ctx.circle.id, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { members: { include: { user: { select: { nickname: true } } } } },
  });

  return (
    <>
      <Header title="自习室" sub="一起专注，各自记录" avatar={ctx.user.nickname.slice(0, 1)} />

      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      <form action={createRoomAction} className="card stack" style={{ gap: 10 }}>
        <b style={{ fontSize: 15 }}>开一间</b>
        <div className="field-row">
          <label className="field">
            <span>名字</span>
            <input name="name" maxLength={30} defaultValue="一起专注" />
          </label>
          <label className="field" style={{ width: 110, flex: "none" }}>
            <span>时长（分钟）</span>
            <input name="duration" type="number" min={5} max={180} defaultValue={25} />
          </label>
        </div>
        <button className="btn" type="submit">
          创建房间
        </button>
      </form>

      <form action={joinRoomAction} className="card stack" style={{ gap: 10, marginTop: 12 }}>
        <b style={{ fontSize: 15 }}>加入别人的</b>
        <div className="field-row">
          <label className="field">
            <span>房间码</span>
            <input name="code" maxLength={6} placeholder="6 位字母数字" />
          </label>
          <button className="btn ghost" type="submit" style={{ alignSelf: "flex-end", width: 96, padding: 13 }}>
            加入
          </button>
        </div>
      </form>

      <div className="section-title">
        <b>开着的房间</b>
        <span className="tiny">{rooms.length} 个开着</span>
      </div>

      {rooms.length === 0 ? (
        <>
          <div style={{ textAlign: "center" }}>
            <Mascot className="mascot mascot-inline" pose="peek" />
          </div>
          <div className="empty">还没有开着的房间。</div>
        </>
      ) : (
        rooms.map((r) => {
          const settings = (r.settings ?? {}) as { durationMinutes?: number };
          const running = !!r.startedAt && !!r.endsAt && r.endsAt.getTime() > Date.now();
          return (
            <Link key={r.id} href={`/rooms/${r.code}`} className="card" style={{ marginTop: 10, display: "block" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div className="tiny" style={{ marginTop: 2 }}>
                    房间码 {r.code} · {settings.durationMinutes ?? 25} 分钟 ·{" "}
                    {r.members.filter((m) => m.state !== "LEFT").length} 人
                  </div>
                </div>
                <span className={`pill ${running ? "ok" : ""}`.trim()}>{running ? "进行中" : "等人"}</span>
              </div>
            </Link>
          );
        })
      )}

    </>
  );
}
