import { NextResponse } from "next/server";
import { getContext } from "@/lib/queries";
import { localDateString } from "@/lib/date";
import { buildDayReport, dayReportToMarkdown } from "@/lib/day-report";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const ctx = await getContext();
  if (!ctx) return new NextResponse("请先登录", { status: 401 });

  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new NextResponse("日期格式不对", { status: 400 });
  }

  const today = localDateString(ctx.user.timezone, ctx.user.dayStartHour);
  if (date > today) return new NextResponse("还没到那一天", { status: 400 });

  const report = await buildDayReport({
    circleId: ctx.circle.id,
    userId: ctx.user.id,
    date,
    timezone: ctx.user.timezone,
    dayStartHour: ctx.user.dayStartHour,
  });

  const md = dayReportToMarkdown(report);

  return new NextResponse(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="duet-${date}.md"`,
      "cache-control": "no-store",
    },
  });
}
