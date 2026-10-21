import Link from "next/link";
import { redirect } from "next/navigation";
import RoomClock from "@/components/RoomClock";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";
import {
  closeRoomAction,
  inviteMemberAction,
  joinRoomAction,
  leaveRoomAction,
  logRoomTimeAction,
  startRoomAction,
} from "@/app/actions/rooms";

const STATE_TEXT: Record<string, string> = {
  READY: "已就位",
  FOCUSING: "专注中",
  BREAK: "休息",
  LEFT: "已离开",
};

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");

  const { code } = await params;
  const { ok, error } = await searchParams;

  const room = await prisma.room.findUnique({
    where: { code },
    include: {
      members: {
        include: { user: { select: { id: true, nickname: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!room || room.circleId !== ctx.circle.id) redirect("/rooms");

  const settings = (room.settings ?? {}) as { durationMinutes?: number };
  const duration = settings.durationMinutes ?? 25;
  const me = room.members.find((m) => m.userId === ctx.user.id);
  const isHost = room.hostId === ctx.user.id;
  const started = !!room.startedAt && !!room.endsAt;
  const ended = started && room.endsAt!.getTime() <= Date.now();
  const closed = room.status === "CLOSED";

  const alreadyLogged = await prisma.timerSession.findFirst({
    where: { userId: ctx.user.id, roomId: room.id },
  });

  const circleMembers = await prisma.circleMember.findMany({
    where: { circleId: ctx.circle.id, status: "ACTIVE" },
    include: { user: { select: { id: true, nickname: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const inRoom = new Set(room.members.filter((m) => m.state !== "LEFT").map((m) => m.userId));
  const outsiders = circleMembers.filter((m) => !inRoom.has(m.user.id));

  const skills = await prisma.skill.findMany({
    where: { circleId: ctx.circle.id, ownerId: ctx.user.id, status: "ACTIVE" },
    select: { id: true, name: true, icon: true },
  });

  return (
    <>
      <header className="header">
        <Link href="/rooms" className="tiny">‹ 自习室</Link>
        <h1 style={{ fontSize: 19 }}>{room.name}</h1>
        <span className="pill" style={{ marginLeft: "auto" }}>房间码 {room.code}</span>
      </header>

      {ok ? <div className="alert ok" style={{ marginBottom: 12 }}>{ok}</div> : null}
      {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

      <RoomClock
        startedAtMs={room.startedAt ? room.startedAt.getTime() : null}
        endsAtMs={room.endsAt ? room.endsAt.getTime() : null}
        durationMinutes={duration}
      />

      <div className="card" style={{ padding: "4px 14px" }}>
        {room.members
          .filter((m) => m.state !== "LEFT")
          .map((m) => (
            <div key={m.id} className="kv">
              <span>
                {m.user.nickname}
                {m.userId === room.hostId ? " · 房主" : ""}
              </span>
              <b>{STATE_TEXT[m.state] ?? m.state}</b>
            </div>
          ))}
        <div className="kv">
          <span>时长</span>
          <b>{duration} 分钟</b>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {!me ? (
          <form action={joinRoomAction}>
            <input type="hidden" name="code" value={room.code} />
            <button className="btn" type="submit">加入这间</button>
          </form>
        ) : isHost && !started ? (
          <form action={startRoomAction}>
            <input type="hidden" name="code" value={room.code} />
            <button className="btn" type="submit">开始这一轮</button>
          </form>
        ) : null}

        {me && !closed ? (
          <form action={leaveRoomAction} style={{ marginTop: 10 }}>
            <input type="hidden" name="code" value={room.code} />
            <button className="btn ghost" type="submit" style={{ width: "100%", padding: 11, fontSize: 14 }}>
              离开
            </button>
          </form>
        ) : null}

        {isHost && !closed ? (
          <form action={closeRoomAction} style={{ marginTop: 10 }}>
            <input type="hidden" name="code" value={room.code} />
            <button className="btn ghost" type="submit" style={{ width: "100%", padding: 11, fontSize: 14 }}>
              关闭房间
            </button>
          </form>
        ) : null}
      </div>

      {ended && !alreadyLogged ? (
        <div className="card" style={{ marginTop: 14 }}>
          <b style={{ fontSize: 14 }}>这一轮结束了</b>
          <div className="tiny" style={{ margin: "6px 0 10px" }}>
            把 {duration} 分钟记到你的技能上，按计分规则给分。
          </div>
          <form action={logRoomTimeAction} className="stack" style={{ gap: 10 }}>
            <input type="hidden" name="code" value={room.code} />
            <select name="skillId" defaultValue="" style={{ padding: "12px 14px", borderRadius: 14, border: "1px solid var(--line)" }}>
              <option value="">不归类</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
            <button className="btn" type="submit">记到我的时间</button>
          </form>
        </div>
      ) : null}

      {alreadyLogged ? (
        <div className="tiny" style={{ marginTop: 12 }}>
          这一轮已记过：{Math.floor(alreadyLogged.elapsedSeconds / 60)} 分钟
          {alreadyLogged.pointsAwarded > 0 ? ` · +${alreadyLogged.pointsAwarded} 分` : ""}
        </div>
      ) : null}

      {!closed && outsiders.length > 0 ? (
        <div className="card" style={{ marginTop: 14 }}>
          <b style={{ fontSize: 14 }}>拉人进来</b>
          {outsiders.map((m) => (
            <div key={m.id} className="kv">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="avatar" style={{ width: 26, height: 26, borderRadius: 9, fontSize: 12 }}>
                  {m.user.nickname.slice(0, 1)}
                </span>
                {m.user.nickname}
              </span>
              <form action={inviteMemberAction}>
                <input type="hidden" name="code" value={room.code} />
                <input type="hidden" name="userId" value={m.user.id} />
                <button className="btn ghost" type="submit" style={{ width: "auto", padding: "6px 12px", fontSize: 12 }}>
                  拉进来
                </button>
              </form>
            </div>
          ))}
        </div>
      ) : null}

      <div className="tiny" style={{ marginTop: 14, textAlign: "center" }}>
        房间码 {room.code}
      </div>
    </>
  );
}
