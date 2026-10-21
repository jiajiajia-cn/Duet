// 新建习惯 + 打卡 + 撤销 的端到端测试
// 用法：node scripts/smoke-habits.mjs
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://127.0.0.1:3100";
const SECRET = process.env.AUTH_SECRET ?? "dev-only-please-change-in-production-8f3a2c";
const prisma = new PrismaClient();
const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("base64url");

const TITLE = `测试习惯 ${Date.now().toString().slice(-5)}`;
let failures = 0;
const ok = (c, m) => {
  console.log((c ? "✅ " : "❌ ") + m);
  if (!c) failures++;
};

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "demo@checkin.local" } });
  const circle = await prisma.circle.findFirst({ where: { ownerId: user.id } });
  const balance = async () =>
    (await prisma.wallet.findUnique({ where: { circleId_userId: { circleId: circle.id, userId: user.id } } })).balance;

  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.addCookies([
    { name: "ck_session", value: `${user.id}.${sign(user.id)}`, domain: "127.0.0.1", path: "/" },
  ]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  console.log("\n=== 1. 新建一个习惯 ===");
  await page.goto(`${BASE}/habits/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="title"]', TITLE);
  await page.fill('input[name="icon"]', "🧪");
  await page.fill('input[name="pointsPerCheckin"]', "12");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/habits\/[^/]+\/edit/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);

  const habit = await prisma.habit.findFirst({ where: { circleId: circle.id, title: TITLE } });
  ok(!!habit, "习惯写进了数据库");
  ok(habit?.pointsPerCheckin === 12, `分值 ${habit?.pointsPerCheckin}`);
  ok(habit?.type === "CHECK", `类型 ${habit?.type}`);
  ok(page.url().includes("/edit"), `提交后停在编辑页：${page.url().replace(BASE, "")}`);

  console.log("\n=== 2. 回今日打卡 ===");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const row = page.locator(".habit", { hasText: TITLE });
  ok((await row.count()) === 1, "今日清单里出现了它");
  const before = await balance();
  await row.locator("button.check").click();
  await page.waitForTimeout(1500);

  const checkin = await prisma.checkin.findFirst({
    where: { habitId: habit.id, userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const after = await balance();
  ok(!!checkin, "生成了打卡记录");
  ok(checkin?.pointsAwarded === 12, `记录分值 ${checkin?.pointsAwarded}`);
  ok(after === before + 12, `余额 ${before} → ${after}`);

  console.log("\n=== 3. 再点一次撤销 ===");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const row2 = page.locator(".habit", { hasText: TITLE });
  await row2.locator("button.check").click();
  await page.waitForTimeout(1500);

  const left = await prisma.checkin.count({ where: { habitId: habit.id, userId: user.id } });
  const back = await balance();
  const txn = await prisma.pointTxn.findFirst({
    where: { type: "ADJUST", refId: checkin.id },
  });
  ok(left === 0, "打卡记录被撤销");
  ok(back === before, `积分退回：${after} → ${back}`);
  ok(txn?.delta === -12, `写了反向流水 ${txn?.delta}`);

  console.log("\n=== 4. 清理 ===");
  await prisma.habit.delete({ where: { id: habit.id } });
  console.log("   已删除测试习惯");

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
