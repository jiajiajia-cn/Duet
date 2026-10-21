import type { Entry } from "@prisma/client";

export type Repeat = {
  kind: "none" | "daily" | "weekly" | "monthly";
  days?: number[]; // 1=周一 … 7=周日
  until?: string | null;
};

export function parseRepeat(raw: string | null): Repeat {
  if (!raw) return { kind: "none" };
  try {
    const o = JSON.parse(raw) as Repeat;
    if (!o?.kind) return { kind: "none" };
    return o;
  } catch {
    return { kind: "none" };
  }
}

export function weekdayOf(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0=周日
  return d === 0 ? 7 : d;
}

export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

/** 这条日程在 date（YYYY-MM-DD）这天是否发生 */
export function occursOn(entry: Pick<Entry, "startAt" | "rrule">, date: string): boolean {
  if (!entry.startAt) return false;
  const base = new Date(entry.startAt);
  const baseDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);

  const rep = parseRepeat(entry.rrule);
  if (date < baseDate) return false;
  if (rep.until && date > rep.until) return false;

  switch (rep.kind) {
    case "daily":
      return true;
    case "weekly":
      return (rep.days ?? []).includes(weekdayOf(date));
    case "monthly":
      return dayOfMonth(date) === dayOfMonth(baseDate);
    default:
      return date === baseDate;
  }
}

export function timeOf(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function dateOf(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export const REPEAT_TEXT: Record<string, string> = {
  none: "不重复",
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
};
