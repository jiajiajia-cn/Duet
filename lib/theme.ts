export const THEMES = [
  "default",
  "light",
  "dark",
  "green",
  "blue",
  "pink",
  "maltese",
] as const;

export type ThemeKey = (typeof THEMES)[number];

export const THEME_META: { key: ThemeKey; name: string; sub: string; bg: string; card: string; dot: string }[] = [
  { key: "default", name: "默认（紫）", sub: "最初的那套", bg: "#f4f5f9", card: "#ffffff", dot: "#5b5bd6" },
  { key: "light", name: "白色", sub: "干净、安静", bg: "#fafafa", card: "#ffffff", dot: "#2f3138" },
  { key: "dark", name: "黑色", sub: "夜里看不刺眼", bg: "#0e1014", card: "#161920", dot: "#8b8bf7" },
  { key: "green", name: "绿色", sub: "像早上刚浇过水", bg: "#f0f7f3", card: "#ffffff", dot: "#0f9d6e" },
  { key: "blue", name: "蓝色", sub: "冷静、专注", bg: "#eff5fd", card: "#ffffff", dot: "#2563eb" },
  { key: "pink", name: "粉色", sub: "软一点也没关系", bg: "#fdf2f6", card: "#ffffff", dot: "#e0508a" },
  { key: "maltese", name: "线条小狗", sub: "奶油纸 + 手绘感 + 小狗", bg: "#fbf6ea", card: "#fffdf6", dot: "#e8a33d" },
];
