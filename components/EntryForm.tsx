import Link from "next/link";
import type { Entry } from "@prisma/client";
import { dateOf, parseRepeat, timeOf } from "@/lib/schedule";

export type EntryDefaults = Entry | null;

const WEEK = [
  { v: 1, t: "一" },
  { v: 2, t: "二" },
  { v: 3, t: "三" },
  { v: 4, t: "四" },
  { v: 5, t: "五" },
  { v: 6, t: "六" },
  { v: 7, t: "日" },
];

export default function EntryForm({
  action,
  entry,
  submitLabel,
}: {
  action: (fd: FormData) => void | Promise<void>;
  entry?: EntryDefaults;
  submitLabel: string;
}) {
  const rep = parseRepeat(entry?.rrule ?? null);
  const days = rep.days ?? [1];
  const date = entry?.startAt ? dateOf(entry.startAt) : "";

  return (
    <form action={action} className="stack">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}

      <label className="field">
        <span>做什么</span>
        <input name="title" defaultValue={entry?.title} maxLength={60} placeholder="比如：去琴行上课" required />
      </label>

      <div className="field-row">
        <label className="field">
          <span>日期</span>
          <input name="date" type="date" defaultValue={date} required />
        </label>
        <label className="field">
          <span>分类</span>
          <input name="category" defaultValue={entry?.category ?? "默认"} maxLength={16} />
        </label>
      </div>

      <label className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" name="allDay" defaultChecked={entry?.allDay ?? false} /> 全天
      </label>

      <div className="field-row">
        <label className="field">
          <span>开始</span>
          <input name="startTime" type="time" defaultValue={entry?.startAt ? timeOf(entry.startAt) : "09:00"} />
        </label>
        <label className="field">
          <span>结束</span>
          <input name="endTime" type="time" defaultValue={entry?.endAt ? timeOf(entry.endAt) : "10:00"} />
        </label>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <b style={{ fontSize: 14 }}>重复</b>
        <label className="field" style={{ marginTop: 8 }}>
          <select name="repeatKind" defaultValue={rep.kind ?? "none"}>
            <option value="none">不重复</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月同一天</option>
          </select>
        </label>
        <div className="tiny" style={{ margin: "10px 0 6px" }}>每周的哪几天（选「每周」时生效）</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {WEEK.map((d) => (
            <label key={d.v} className="chip" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" name="repDays" value={d.v} defaultChecked={days.includes(d.v)} />
              {d.t}
            </label>
          ))}
        </div>
      </div>

      <label className="field">
        <span>预计多少分钟（可选，用来做计划 vs 实际）</span>
        <input name="estimateMin" type="number" min={0} defaultValue={entry?.estimateMin ?? ""} placeholder="比如 60" />
      </label>

      <label className="field">
        <span>备注</span>
        <textarea name="note" rows={2} defaultValue={entry?.note ?? ""} maxLength={200} />
      </label>

      <button className="btn" type="submit">
        {submitLabel}
      </button>
      <Link href="/schedule" className="btn ghost" style={{ marginTop: 10, textAlign: "center" }}>
        返回
      </Link>
    </form>
  );
}
