import type { Habit } from "@prisma/client";

/** 习惯表单的初始值（服务端算好再传给客户端表单） */
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
