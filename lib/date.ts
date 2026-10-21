/**
 * 逻辑日期：凌晨 N 点之前算前一天。
 * 不用 Date 存日期，全部走 "YYYY-MM-DD" 字符串，避免时区/夏令时踩坑。
 */
export function localDateString(
  timezone: string,
  dayStartHour = 0,
  at: Date = new Date(),
): string {
  const shifted = new Date(at.getTime() - dayStartHour * 3600_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

/** 在逻辑日期上加减天数，仍返回 YYYY-MM-DD */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayIndex(date: string): number {
  // 0=周日 … 6=周六
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function humanDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const wd = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getUTCDay()];
  return `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日 · ${wd}`;
}
