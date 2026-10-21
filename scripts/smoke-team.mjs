// 一起打卡：两个人都打了才加分；撤一个，两边一起回滚
// 用法：node scripts/smoke-team.mjs
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://127.0.0.1:3100";
const SECRET = process.env.AUTH_SECRET ?? "dev-only-please-change-in-production-8f3a2c";
const prisma = new PrismaClient();
const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("base64url");

let failures = 0;
const ok = (c, m) => {
  console.log((c ? "✅ " : "❌ ") + m);
  if (!c) failures++;
};

async function ctxFor(browser, user) {
  const c = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await c.addCookies([{ name: "ck_session", value: `${user.id}.${sign(user.id)}`, domain: "127.0.0.1", path: "/" }]);
  return c;
}

async function main() {
  const demo = await prisma.user.findUnique({ where: { email: "demo@checkin.local" } });
  const yu = await prisma.user.findUnique({ where: { email: "xiaoyu@checkin.local" } });
  const circle = await prisma.circle.findFirst({ where: { ownerId: demo.id } });

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // 造一个"一起打卡"的习惯
  const title = `一起打卡测试 ${Date.now().toString().slice(-4)}`;
  const habit = await prisma.habit.create({
    data: {
      circleId: circle.id,
      ownerId: demo.id,
      title,
      icon: "🐶",
      type: "CHECK",
      frequency: { kind: "daily" },
      pointsPerCheckin: 12,
      collaborative: true,
      sortOrder: 9,
    },
  });

  const balance = async (uid) =>
    (await prisma.wallet.findUnique({ where: { circleId_userId: { circleId: circle.id, userId: uid } } })).balance;

  const b0 = { demo: await balance(demo.id), yu: await balance(yu.id) };

  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const demoCtx = await ctxFor(browser, demo);
  const yuCtx = await ctxFor(browser, yu);
  const dp = await demoCtx.newPage();
  const yp = await yuCtx.newPage();
  const errs = [];
  dp.on("pageerror", (e) => errs.push(e.message));
  yp.on("pageerror", (e) => errs.push(e.message));

  console.log("\n=== 1. 小满先打卡：记上但没钱 ===");
  await dp.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const row = dp.locator(".habit", { hasText: title });
  ok((await row.count()) === 1, "小满能看到这个共同习惯");
  await row.locator("button.check").click();
  await dp.waitForTimeout(1500);

  const c1 = await prisma.checkin.findFirst({ where: { habitId: habit.id, userId: demo.id } });
  ok(!!c1 && c1.pointsAwarded === 0, `记录了但没发分（${c1?.pointsAwarded}）`);
  ok((await balance(demo.id)) === b0.demo, "小满余额没变");
  ok((await dp.locator(".habit", { hasText: title }).innerText()).includes("1/2"), "页面显示 1/2");

  console.log("\n=== 2. 小雨打卡：凑齐，两个人都加分 ===");
  await yp.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const yrow = yp.locator(".habit", { hasText: title });
  ok((await yrow.count()) === 1, "小雨也能看到（共同习惯）");
  await yrow.locator("button.check").click();
  await yp.waitForTimeout(1600);

  const all = await prisma.checkin.findMany({ where: { habitId: habit.id, localDate: today } });
  ok(all.length === 2, `两个人都有记录（${all.length}）`);
  ok(all.every((c) => c.pointsAwarded === 12), "两人各得 12 分");
  ok((await balance(demo.id)) === b0.demo + 12, `小满 ${b0.demo} → ${await balance(demo.id)}`);
  ok((await balance(yu.id)) === b0.yu + 12, `小雨 ${b0.yu} → ${await balance(yu.id)}`);

  await dp.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const txt = await dp.locator(".habit", { hasText: title }).innerText();
  ok(txt.includes("一起成功"), "页面显示「一起成功」");

  console.log("\n=== 3. 撤销一个：两边都回滚 ===");
  const row2 = dp.locator(".habit", { hasText: title });
  await row2.locator("button.check").click();
  await dp.waitForTimeout(1600);

  const after = await prisma.checkin.findMany({ where: { habitId: habit.id, localDate: today } });
  ok(after.length === 1, `只剩小雨的记录（${after.length}）`);
  ok(after.every((c) => c.pointsAwarded === 0), "小雨的分也被回滚了");
  ok((await balance(demo.id)) === b0.demo, `小满退回 ${await balance(demo.id)}`);
  ok((await balance(yu.id)) === b0.yu, `小雨退回 ${await balance(yu.id)}`);

  // 清理
  await prisma.checkin.deleteMany({ where: { habitId: habit.id } });
  await prisma.timerSession.deleteMany({ where: { userId: { in: [demo.id, yu.id] }, startedAt: { gte: new Date(Date.now() - 60_000) } } });
  await prisma.habitStat.deleteMany({ where: { habitId: habit.id } });
  await prisma.habit.delete({ where: { id: habit.id } });

  console.log("\n页面错误数 =", errs.length, errs[0] ?? "");
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
