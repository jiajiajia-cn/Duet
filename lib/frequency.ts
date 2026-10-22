/** 习惯频率：判断某一天该不该做这件事 */

export type Freq = { kind?: string; days?: number[]; times?: number };

/** ISO 星期：周一=1 … 周日=7 */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const wd = d.getUTCDay(); // 0=周日
  return wd === 0 ? 7 : wd;
}

/** 这一天的开始（按用户设置的周首日，1=周一 0=周日） */
export function weekStartDate(date: string, weekStart = 1): string {
  const d = new Date(`${date}T00:00:00Z`);
  const wd = d.getUTCDay();
  const target = weekStart === 0 ? 0 : 1;
  let diff = wd - target;
  if (diff < 0) diff += 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

/** 只按“星期几”判断；perWeek 还要结合本周已做次数 */
export function isDueByDay(freq: Freq | null | undefined, date: string): boolean {
  const kind = freq?.kind ?? "daily";
  if (kind === "weekdays") {
    const days = freq?.days ?? [];
    if (!days.length) return true; // 没选任何一天就当每天
    return days.includes(isoWeekday(date));
  }
  return true;
}

/** 完整的“今天要不要做”判断（perWeek 传本周已完成次数） */
export function isDueToday(
  freq: Freq | null | undefined,
  date: string,
  doneThisWeek = 0,
): boolean {
  const kind = freq?.kind ?? "daily";
  if (kind === "perWeek") {
    const times = Math.max(1, freq?.times ?? 3);
    return doneThisWeek < times;
  }
  return isDueByDay(freq, date);
}

const WEEKDAY_TEXT = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/** 习惯列表上显示的一句频率说明 */
export function freqText(freq: Freq | null | undefined): string {
  const kind = freq?.kind ?? "daily";
  if (kind === "weekdays") {
    const days = (freq?.days ?? []).slice().sort((a, b) => a - b);
    if (!days.length) return "每天";
    if (days.length === 5 && days.every((d, i) => d === i + 1)) return "工作日";
    if (days.length === 7) return "每天";
    return days.map((d) => WEEKDAY_TEXT[d]).join(" ");
  }
  if (kind === "perWeek") return `每周 ${freq?.times ?? 3} 次`;
  return "每天";
}
