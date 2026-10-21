// 监督打卡端到端：A 打卡变待确认 → B 确认 → 才加分
// 用法：node scripts/smoke-review.mjs
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://127.0.0.1:3100";
const SECRET = process.env.AUTH_SECRET ?? "dev-only-please-change-in-production-8f3a2c";
const prisma = new PrismaClient();
const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("base64url");
const cookieOf = (u) => `${u.id}.${sign(u.id)}`;

let failures = 0;
const ok = (c, m) => {
  console.log((c ? "✅ " : "❌ ") + m);
  if (!c) failures++;
};

async function ctxFor(browser, user) {
  const c = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await c.addCookies([
    { name: "ck_session", value: cookieOf(user), domain: "127.0.0.1", path: "/" },
  ]);
  return c;
}

async function main() {
  const demo = await prisma.user.findUnique({ where: { email: "demo@checkin.local" } });
  const yu = await prisma.user.findUnique({ where: { email: "xiaoyu@checkin.local" } });
  const circle = await prisma.circle.findFirst({ where: { ownerId: demo.id } });

  // 找一个普通打卡型习惯，改成"需要确认"
  const habit = await prisma.habit.findFirst({
    where: { circleId: circle.id, ownerId: demo.id, type: "CHECK", collaborative: false },
    orderBy: { sortOrder: "asc" },
  });
  if (!habit) throw new Error("没有可用的打卡习惯");

  await prisma.habit.update({ where: { id: habit.id }, data: { needsReview: true } });
  await prisma.checkin.deleteMany({ where: { habitId: habit.id, userId: demo.id } });
  const balance = async () =>
    (await prisma.wallet.findUnique({ where: { circleId_userId: { circleId: circle.id, userId: demo.id } } })).balance;
  const before = await balance();
  const statBefore = await prisma.habitStat.findFirst({ where: { habitId: habit.id, userId: demo.id } });

  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const demoCtx = await ctxFor(browser, demo);
  const yuCtx = await ctxFor(browser, yu);
  const demoPage = await demoCtx.newPage();
  const yuPage = await yuCtx.newPage();
  const errors = [];
  demoPage.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  yuPage.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  console.log("\n=== 1. 小满打卡 → 变待确认，不加分 ===");
  await demoPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const row = demoPage.locator(".habit", { hasText: habit.title });
  await row.locator("button.check").click();
  await demoPage.waitForTimeout(1500);

  const pending = await prisma.checkin.findFirst({
    where: { habitId: habit.id, userId: demo.id },
    orderBy: { createdAt: "desc" },
  });
  ok(pending?.status === "PENDING", `状态 ${pending?.status}`);
  ok(pending?.pointsAwarded === 0, `还没有发分（${pending?.pointsAwarded}）`);
  ok((await balance()) === before, "余额没变");
  const statAfter = await prisma.habitStat.findFirst({ where: { habitId: habit.id, userId: demo.id } });
  ok(
    (statAfter?.lastDoneDate ?? null) === (statBefore?.lastDoneDate ?? null),
    "连续天数也还没动",
  );

  console.log("\n=== 2. 小雨在待确认页看到它 ===");
  await yuPage.goto(`${BASE}/review`, { waitUntil: "networkidle" });
  const card = yuPage.locator(".card", { hasText: `小满 · ${habit.title}` });
  ok((await card.count()) >= 1, "小雨能看到这条待确认");
  ok(await card.first().getByRole("button", { name: /确认/ }).isVisible(), "有确认按钮");

  console.log("\n=== 3. 小雨确认 → 小满加分 ===");
  await card.first().getByRole("button", { name: /确认/ }).click();
  await yuPage.waitForTimeout(1600);

  const approved = await prisma.checkin.findUnique({ where: { id: pending.id } });
  ok(approved?.status === "APPROVED", `状态 ${approved?.status}`);
  ok(approved?.pointsAwarded === habit.pointsPerCheckin, `发了 ${approved?.pointsAwarded} 分`);
  ok((await balance()) === before + habit.pointsPerCheckin, `余额 ${before} → ${await balance()}`);
  const stat2 = await prisma.habitStat.findFirst({ where: { habitId: habit.id, userId: demo.id } });
  ok(stat2?.lastDoneDate === pending.localDate, "连续天数记上了");

  const note = await prisma.notification.findFirst({
    where: { userId: demo.id, type: "CHECKIN_REVIEW" },
    orderBy: { createdAt: "desc" },
  });
  ok(!!note, `小满收到通知：${note?.title}`);

  console.log("\n=== 4. 通知页能打开 ===");
  await demoPage.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
  ok(await demoPage.getByText("打卡已确认").first().isVisible(), "通知列表里能看到");

  console.log("\n=== 5. 不能确认自己的 ===");
  await prisma.checkin.update({ where: { id: pending.id }, data: { status: "PENDING", pointsAwarded: 0 } });
  await demoPage.goto(`${BASE}/review`, { waitUntil: "networkidle" });
  const own = demoPage.locator(".card", { hasText: `小满 · ${habit.title}` });
  ok((await own.count()) >= 1, "自己的待确认也能看到");
  ok(!(await own.first().getByRole("button", { name: /确认/ }).count()), "但没有「确认」按钮");

  // 清理：恢复状态
  await prisma.checkin.deleteMany({ where: { habitId: habit.id, userId: demo.id } });
  await prisma.habit.update({ where: { id: habit.id }, data: { needsReview: false } });
  await prisma.notification.deleteMany({ where: { userId: demo.id, type: "CHECKIN_REVIEW" } });
  await prisma.wallet.update({
    where: { circleId_userId: { circleId: circle.id, userId: demo.id } },
    data: { balance: before, totalEarned: before },
  });

  console.log("\n控制台错误数 =", errors.length);
  console.log(failures === 0 ? "\n全部通过 🎉" : `\n有 ${failures} 项失败`);

  await browser.close();
  await prisma.$disconnect();
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(async (e) => {
  console.error("❌", e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
