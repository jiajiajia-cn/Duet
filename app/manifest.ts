import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Duet · 两个人的打卡账本",
    short_name: "Duet",
    description: "一起打卡、专注自习、积分换奖励",
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
