import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "签到",
    short_name: "签到",
    description: "习惯打卡、积分换奖品、专注计时与技能记录",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f9",
    theme_color: "#5b5bd6",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
