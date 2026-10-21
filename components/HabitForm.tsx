import Link from "next/link";
import type { Habit } from "@prisma/client";

export type HabitDefaults = {
  id?: string;
  title?: string;
  icon?: string;
  type?: string;
  goalType?: string;
  frequency?: unknown;
  unit?: string | null;
  countPerDay?: number;
  pointsPerCheckin?: number;
  pointsPerUnit?: number;
  dailyCap?: number | null;
  minTimerMinutes?: number;
  autoCheckinOnTimer?: boolean;
  defaultSkillId?: string | null;
  remindAt?: string | null;
  needsReview?: boolean;
  collaborative?: boolean;
};

const WEEK = [
  { v: 1, t: "一" },
  { v: 2, t: "二" },
  { v: 3, t: "三" },
  { v: 4, t: "四" },
  { v: 5, t: "五" },
  { v: 6, t: "六" },
  { v: 7, t: "日" },
];

const ICONS = ["🌅", "📖", "💧", "🏃", "🎸", "🧘", "💊", "🥗", "🛏️", "✍️", "🚫", "🧹"];

export function habitDefaultsOf(h: Habit): HabitDefaults {
  const freq = (h.frequency ?? { kind: "daily" }) as { kind?: string; days?: number[]; times?: number };
  return {
    id: h.id,
    title: h.title,
    icon: h.icon,
    type: h.type,
    goalType: h.goalType,
    frequency: freq,
    unit: h.unit,
    countPerDay: h.countPerDay,
    pointsPerCheckin: h.pointsPerCheckin,
    pointsPerUnit: h.pointsPerUnit,
    dailyCap: h.dailyCap,
    minTimerMinutes: h.minTimerMinutes,
    autoCheckinOnTimer: h.autoCheckinOnTimer,
    defaultSkillId: h.defaultSkillId,
    remindAt: h.remindAt,
    needsReview: h.needsReview,
    collaborative: h.collaborative,
  };
}

export default function HabitForm({
  action,
  defaults = {},
  skills,
  submitLabel,
}: {
  action: (fd: FormData) => void | Promise<void>;
  defaults?: HabitDefaults;
  skills: { id: string; name: string; icon: string }[];
  submitLabel: string;
}) {
  const freq = (defaults.frequency ?? { kind: "daily" }) as {
    kind?: string;
    days?: number[];
    times?: number;
  };
  const days = freq.days ?? [1, 2, 3, 4, 5];

  return (
    <form action={action} className="stack">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <div className="field-row">
        <label className="field" style={{ width: 88, flex: "none" }}>
          <span>图标</span>
          <input name="icon" defaultValue={defaults.icon ?? "✅"} maxLength={4} />
        </label>
        <label className="field">
          <span>名字</span>
          <input name="title" defaultValue={defaults.title} maxLength={40} placeholder="比如：阅读 30 分钟" required />
        </label>
      </div>

      <div className="tiny" style={{ marginTop: -6 }}>
        {ICONS.join(" ")} ← 可以直接复制一个到图标框
      </div>

      <label className="field">
        <span>类型</span>
        <select name="type" defaultValue={defaults.type ?? "CHECK"}>
          <option value="CHECK">普通打卡（做完点一下）</option>
          <option value="QUANTITY">计量（喝水 3 杯这种）</option>
          <option value="TIMED">计时型（练琴 45 分钟）</option>
          <option value="NEGATIVE">负向 / 戒断（今天没做就得分）</option>
        </select>
      </label>

      <div className="card" style={{ padding: 12 }}>
        <b style={{ fontSize: 14 }}>频率</b>
        <label className="field" style={{ marginTop: 8 }}>
          <select name="freqKind" defaultValue={freq.kind ?? "daily"}>
            <option value="daily">每天</option>
            <option value="weekdays">每周指定的几天</option>
            <option value="perWeek">每周 N 次（不限哪天）</option>
          </select>
        </label>

        <div className="tiny" style={{ margin: "10px 0 6px" }}>
          每周指定的几天（选"每周指定的几天"时才生效）
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {WEEK.map((d) => (
            <label key={d.v} className="chip" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" name="days" value={d.v} defaultChecked={days.includes(d.v)} />
              {d.t}
            </label>
          ))}
        </div>

        <label className="field" style={{ marginTop: 10 }}>
          <span>每周几次（选"每周 N 次"时才生效）</span>
          <input name="times" type="number" min={1} max={7} defaultValue={freq.times ?? 3} />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>打卡一次给多少分</span>
          <input name="pointsPerCheckin" type="number" min={0} defaultValue={defaults.pointsPerCheckin ?? 10} />
        </label>
        <label className="field">
          <span>单日上限（留空不限）</span>
          <input name="dailyCap" type="number" min={0} defaultValue={defaults.dailyCap ?? ""} placeholder="不限" />
        </label>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <b style={{ fontSize: 14 }}>计量型专用</b>
        <div className="field-row" style={{ marginTop: 8 }}>
          <label className="field">
            <span>单位</span>
            <input name="unit" defaultValue={defaults.unit ?? "杯"} maxLength={8} />
          </label>
          <label className="field">
            <span>每单位几分</span>
            <input name="pointsPerUnit" type="number" min={0} defaultValue={defaults.pointsPerUnit ?? 5} />
          </label>
          <label className="field">
            <span>每天最多几次</span>
            <input name="countPerDay" type="number" min={1} defaultValue={defaults.countPerDay ?? 3} />
          </label>
        </div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <b style={{ fontSize: 14 }}>计时型专用</b>
        <div className="field-row" style={{ marginTop: 8 }}>
          <label className="field">
            <span>至少多少分钟算达标</span>
            <input name="minTimerMinutes" type="number" min={0} defaultValue={defaults.minTimerMinutes ?? 45} />
          </label>
          <label className="field">
            <span>关联技能</span>
            <select name="defaultSkillId" defaultValue={defaults.defaultSkillId ?? ""}>
              <option value="">不关联</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10 }}>
          <input type="checkbox" name="autoCheckinOnTimer" defaultChecked={defaults.autoCheckinOnTimer ?? true} />
          达标后自动打卡
        </label>
      </div>

      <label className="field">
        <span>提醒时间（可选）</span>
        <input name="remindAt" type="time" defaultValue={defaults.remindAt ?? ""} />
      </label>

      <div className="card" style={{ padding: 12 }}>
        <b style={{ fontSize: 14 }}>一起打卡</b>
        <label className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10 }}>
          <input type="checkbox" name="collaborative" defaultChecked={defaults.collaborative ?? false} />
          所有人都完成才算成功
        </label>
        <div className="tiny" style={{ marginTop: 8, lineHeight: 1.5 }}>
          打开后：谁先打卡都只记成"已完成"，等所有人都打了，才一起加分；中途有人撤销，整天的分一起回滚。
        </div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <b style={{ fontSize: 14 }}>监督打卡</b>
        <label className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10 }}>
          <input type="checkbox" name="needsReview" defaultChecked={defaults.needsReview ?? false} />
          打卡需要对方确认才生效
        </label>
        <div className="tiny" style={{ marginTop: 8, lineHeight: 1.5 }}>
          打开后：点打卡先记成"待确认"，不发分、不算连续天数；对方在「待确认」页点头之后才真正生效。
        </div>
      </div>

      <button className="btn" type="submit" style={{ marginTop: 4 }}>
        {submitLabel}
      </button>
      <Link href="/habits" className="btn ghost" style={{ marginTop: 10, textAlign: "center" }}>
        返回
      </Link>
    </form>
  );
}
