import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/queries";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return new Response("请先登录", { status: 401 });

  const format = new URL(req.url).searchParams.get("format") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const checkins = await prisma.checkin.findMany({
      where: { userId: ctx.user.id },
      orderBy: [{ localDate: "desc" }, { seq: "desc" }],
      include: { habit: { select: { title: true, type: true } } },
    });

    const header = ["日期", "习惯", "类型", "数量", "得分", "状态", "来源", "备注"];
    const lines = [header.join(",")];
    for (const c of checkins) {
      lines.push(
        [
          c.localDate,
          c.habit.title,
          c.habit.type,
          c.quantity,
          c.pointsAwarded,
          c.status,
          c.source,
          c.note ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
    }

    return new Response("\uFEFF" + lines.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="checkins-${stamp}.csv"`,
      },
    });
  }

  const [habits, checkins, sessions, txns, redemptions, skills] = await Promise.all([
    prisma.habit.findMany({ where: { circleId: ctx.circle.id, ownerId: ctx.user.id } }),
    prisma.checkin.findMany({ where: { userId: ctx.user.id }, orderBy: { checkedAt: "desc" } }),
    prisma.timerSession.findMany({ where: { userId: ctx.user.id }, orderBy: { startedAt: "desc" } }),
    prisma.pointTxn.findMany({
      where: { wallet: { circleId: ctx.circle.id, userId: ctx.user.id } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.redemption.findMany({
      where: { circleId: ctx.circle.id, participants: { some: { userId: ctx.user.id } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.skill.findMany({ where: { circleId: ctx.circle.id, ownerId: ctx.user.id } }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    user: { nickname: ctx.user.nickname, timezone: ctx.user.timezone, dayStartHour: ctx.user.dayStartHour },
    circle: { name: ctx.circle.name, inviteCode: ctx.circle.inviteCode, role: ctx.role },
    habits,
    checkins,
    skills,
    timerSessions: sessions,
    pointTxns: txns,
    redemptions,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="checkin-backup-${stamp}.json"`,
    },
  });
}
