// 用真实浏览器（本机 Edge）跑一遍关键页面，截图 + 收集控制台错误
// 用法：node scripts/uishot.mjs
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://127.0.0.1:3100";
const SECRET = process.env.AUTH_SECRET ?? "dev-only-please-change-in-production-8f3a2c";
const prisma = new PrismaClient();
const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("base64url");

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "demo@checkin.local" } });
  if (!user) throw new Error("先跑 node scripts/seed.mjs");

  const circle = await prisma.circle.findFirst({ where: { ownerId: user.id } });
  const headphone = await prisma.reward.findFirst({
    where: { circleId: circle.id, title: "那副一直在看的耳机" },
  });
  const milktea = await prisma.reward.findFirst({
    where: { circleId: circle.id, title: "周末一杯奶茶" },
  });

  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  await ctx.addCookies([
    {
      name: "ck_session",
      value: `${user.id}.${sign(user.id)}`,
      domain: "127.0.0.1",
      path: "/",
    },
  ]);

  const errors = [];
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });

  async function shot(path, file) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `shots/${file}` });
    console.log("shot", path, "->", file);
  }

  await shot("/", "today.png");
  await shot("/habits", "habits.png");
  await shot("/habits/new", "habit-new.png");
  await shot("/me", "me.png");
  await shot("/settings", "settings.png");
  await shot("/settings/credit", "credit.png");
  await shot("/skills", "skills.png");
  await shot("/schedule", "schedule.png");
  await shot("/rooms", "rooms.png");
  await shot("/backfill", "backfill.png");
  await shot("/admin/members", "members.png");
  await shot("/review", "review.png");
  await shot("/notifications", "notifications.png");
  await shot("/timer", "timer.png");
  await shot("/rewards", "rewards.png");
  if (headphone) await shot(`/rewards/${headphone.id}`, "reward-detail.png");
  if (milktea) await shot(`/rewards/${milktea.id}`, "reward-milktea.png");
  await shot("/orders", "orders.png");
  await shot("/admin/rewards", "admin-rewards.png");
  await shot("/admin/orders", "admin-orders.png");
  await shot("/rewards/new", "reward-new.png");

  // 真点一次「凑齐合兑」，验证交互 + 数据库
  if (headphone) {
    await page.goto(`${BASE}/rewards/${headphone.id}`, { waitUntil: "networkidle" });
    const join = page.getByRole("button", { name: /凑齐它|出 \d+ 分/ });
    if (await join.count()) {
      const before = await prisma.wallet.findUnique({
        where: { circleId_userId: { circleId: circle.id, userId: user.id } },
      });
      await join.first().click();
      await page.waitForTimeout(1500);
      const after = await prisma.wallet.findUnique({
        where: { circleId_userId: { circleId: circle.id, userId: user.id } },
      });
      const g = await prisma.redemption.findFirst({
        where: { circleId: circle.id, type: "GROUP" },
        orderBy: { createdAt: "desc" },
      });
      console.log(`点击凑齐：余额 ${before?.balance} -> ${after?.balance}，合兑单状态 ${g?.status}`);
      await page.screenshot({ path: "shots/after-join.png" });
    } else {
      console.log("没找到「凑齐合兑」按钮");
    }
  }

  // 未登录时访问首页应跳到登录页
  const anon = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  const p2 = await anon.newPage();
  await p2.goto(BASE + "/", { waitUntil: "networkidle" });
  console.log("未登录访问 / 最终地址 =", p2.url());
  await p2.screenshot({ path: "shots/login.png" });

  console.log("控制台错误数 =", errors.length);
  errors.slice(0, 6).forEach((e) => console.log("  !", e));

  await browser.close();
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
