import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import TabBar from "@/components/TabBar";
import { getContext } from "@/lib/queries";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "签到",
  description: "习惯打卡、积分换奖品、专注计时与技能记录",
  applicationName: "签到",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "签到" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f5f9",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 有没有"等我确认"的打卡，用来在底栏「今天」上点一个小红点
  let alert = false;
  try {
    const ctx = await getContext();
    if (ctx) {
      const pending = await prisma.checkin.count({
        where: { habit: { circleId: ctx.circle.id }, status: "PENDING" },
      });
      alert = pending > 0;
    }
  } catch {
    alert = false;
  }

  const theme = (await cookies()).get("ck_theme")?.value ?? "default";

  return (
    <html lang="zh-CN" data-theme={theme}>
      <body>
        <div className="app">
          <div className="app-inner">{children}</div>
          <TabBar alert={alert} />
        </div>
      </body>
    </html>
  );
}
