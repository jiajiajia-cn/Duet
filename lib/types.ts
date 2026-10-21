export type Pill = { text: string; kind?: "brand" | "ok" | "warn" };

export type HabitType = "check" | "quantity" | "negative" | "timed";

export type HabitRow = {
  id: string;
  title: string;
  icon: string;
  sub: string;
  points: number;
  type: HabitType;
  done: boolean;
  pill?: Pill;
  /** 一起打卡的进度（只有 collaborative 习惯才有） */
  team?: { done: number; total: number; completed: boolean };
};

export type RewardRow = {
  id: string;
  title: string;
  emoji: string;
  points: number;
  tag?: { text: string; tone?: "dark" | "green" };
  insufficient?: boolean;
};

export type SkillRow = {
  id: string;
  name: string;
  emoji: string;
  tint: string;
  level: number;
  hours: number;
  nextLevelHours: number;
  progress: number; // 0-10 个格子
};

export type TimerRecord = {
  id: string;
  emoji: string;
  title: string;
  minutes: number;
  range: string;
  points: number;
};

export type Wallet = {
  balance: number;
  weekEarned: number;
  totalEarned: number;
  pendingDelivery: number;
};
