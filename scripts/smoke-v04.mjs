// v0.4 五个新功能的端到端测试：补打卡 / 手动调分 / 里程碑 / 番茄 / 日程 / 自习室
// 用法：node scripts/smoke-v04.mjs
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

const TZ = "Asia/Shanghai";
const localDate = (offset = 0, at = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at.getTime() + offset * 86400_000));

async function ctxFor(browser, user) {
  const c = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await c.addCookies([{ name: "ck_session", value: `${user.id}.${sign(user.id)}`, domain: "127.0.0.1", path: "/" }]);
  return c;
}

async function main() {
  const demo = await prisma.user.findUnique({ where: { email: "demo@checkin.local" } });
  const yu = await prisma.user.findUnique({ where: { email: "xiaoyu@checkin.local" } });
  const circle = await prisma.circle.findFirst({ where: { ownerId: demo.id } });

  const balance = async (uid) =>
    (await prisma.wallet.findUnique({ where: { circleId_userId: { circleId: circle.id, userId: uid } } })).balance;

  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const demoCtx = await ctxFor(browser, demo);
  const page = await demoCtx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // ---------- 1. 补打卡 ----------
  console.log("\n=== 1. 补打卡 ===");
  const habit = await prisma.habit.findFirst({
    where: { circleId: circle.id, ownerId: demo.id, type: "CHECK" },
    orderBy: { sortOrder: "asc" },
  });
  await prisma.habit.update({ where: { id: habit.id }, data: { backfillPointsRatio: 0 } });
  const yesterday = localDate(-1);
  await prisma.checkin.deleteMany({ where: { habitId: habit.id, userId: demo.id, localDate: yesterday } });

  await page.goto(`${BASE}/backfill`, { waitUntil: "networkidle" });
  const card = page.locator(".card", { hasText: habit.title });
  const dayBtn = card.locator("form").first().locator("button");
  if (await dayBtn.count()) {
    await dayBtn.click();
    await page.waitForTimeout(1200);
  }
  const bf = await prisma.checkin.findFirst({
    where: { habitId: habit.id, userId: demo.id, source: "BACKFILL" },
    orderBy: { createdAt: "desc" },
  });
  ok(!!bf, `生成了补记记录（${bf?.localDate}）`);
  ok(bf?.pointsAwarded === 0, `补记默认 0 分（${bf?.pointsAwarded}）`);

  // ---------- 2. 手动调分 ----------
  console.log("\n=== 2. 手动调分 ===");
  const yuBefore = await balance(yu.id);
  await page.goto(`${BASE}/admin/members`, { waitUntil: "networkidle" });
  const yuCard = page.locator(".card", { hasText: "小雨" });
  await yuCard.locator('input[name="delta"]').fill("30");
  await yuCard.locator('input[name="reason"]').fill("今天帮忙带了早饭");
  await yuCard.getByRole("button", { name: "调整积分" }).click();
  await page.waitForTimeout(1500);
  const yuAfter = await balance(yu.id);
  const adj = await prisma.pointTxn.findFirst({
    where: { type: "ADJUST", refType: "manual" },
    orderBy: { createdAt: "desc" },
  });
  ok(yuAfter === yuBefore + 30, `小雨余额 ${yuBefore} → ${yuAfter}`);
  ok(adj?.delta === 30 && adj?.operatorId === demo.id, "流水记了操作人和理由");

  // ---------- 3. 里程碑 ----------
  console.log("\n=== 3. 连续 7 天里程碑 ===");
  const habit2 = await prisma.habit.findFirst({
    where: { circleId: circle.id, ownerId: demo.id, type: "CHECK", id: { not: habit.id } },
    orderBy: { sortOrder: "asc" },
  });
  await prisma.checkin.deleteMany({ where: { habitId: habit2.id, userId: demo.id } });
  for (let i = 6; i >= 1; i--) {
    await prisma.checkin.create({
      data: {
        habitId: habit2.id,
        userId: demo.id,
        localDate: localDate(-i),
        seq: 1,
        quantity: 1,
        status: "APPROVED",
        source: "MANUAL",
        pointsAwarded: 0,
      },
    });
  }
  await prisma.habitStat.upsert({
    where: { habitId_userId: { habitId: habit2.id, userId: demo.id } },
    create: { habitId: habit2.id, userId: demo.id, currentStreak: 6, bestStreak: 6, lastDoneDate: localDate(-1), totalDone: 6 },
    update: { currentStreak: 6, bestStreak: 6, lastDoneDate: localDate(-1), totalDone: 6 },
  });
  await prisma.pointTxn.deleteMany({ where: { type: "EARN_BONUS" } });

  const before3 = await balance(demo.id);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.locator(".habit", { hasText: habit2.title }).locator("button.check").click();
  await page.waitForTimeout(1600);

  const stat = await prisma.habitStat.findFirst({ where: { habitId: habit2.id, userId: demo.id } });
  const bonus = await prisma.pointTxn.findFirst({ where: { type: "EARN_BONUS" } });
  const after3 = await balance(demo.id);
  ok(stat?.currentStreak === 7, `连续天数 ${stat?.currentStreak}`);
  ok(bonus?.delta === 20, `里程碑奖励 ${bonus?.delta} 分`);
  ok(after3 === before3 + habit2.pointsPerCheckin + 20, `余额 ${before3} → ${after3}（打卡分 + 里程碑）`);

  // ---------- 4. 番茄 ----------
  console.log("\n=== 4. 番茄轮次 ===");
  await prisma.timerSession.deleteMany({ where: { userId: demo.id, status: { in: ["RUNNING", "PAUSED"] } } });
  await page.goto(`${BASE}/timer`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "🍅 番茄" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /开始第 \d+ 轮专注/ }).click();
  await page.waitForTimeout(1200);

  const pomo = await prisma.timerSession.findFirst({
    where: { userId: demo.id, status: { in: ["RUNNING", "PAUSED"] } },
  });
  ok(pomo?.mode === "POMODORO" && pomo?.phase === "FOCUS", `番茄专注段 ${pomo?.mode}/${pomo?.phase}`);

  await prisma.timerSession.update({
    where: { id: pomo.id },
    data: { startedAt: new Date(Date.now() - 26 * 60_000) },
  });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "结束", exact: true }).click();
  await page.waitForTimeout(1800);
  const done4 = await prisma.timerSession.findUnique({ where: { id: pomo.id } });
  ok(done4?.status === "COMPLETED" && done4?.pointsAwarded === 10, `专注段结算 ${done4?.pointsAwarded} 分`);

  const breakBtn = page.getByRole("button", { name: /开始短休/ });
  ok(await breakBtn.isVisible().catch(() => false), "结束后提示开始短休");
  if (await breakBtn.isVisible().catch(() => false)) {
    await breakBtn.click();
    await page.waitForTimeout(1200);
    const br = await prisma.timerSession.findFirst({
      where: { userId: demo.id, status: { in: ["RUNNING", "PAUSED"] } },
    });
    ok(br?.phase === "BREAK", `休息段 ${br?.phase}`);
    await prisma.timerSession.update({
      where: { id: br.id },
      data: { startedAt: new Date(Date.now() - 6 * 60_000) },
    });
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /结束休息|结束/ }).first().click();
    await page.waitForTimeout(1500);
    const doneBreak = await prisma.timerSession.findUnique({ where: { id: br.id } });
    ok(doneBreak?.pointsAwarded === 0, `休息不发分（${doneBreak?.pointsAwarded}）`);
  }

  // ---------- 5. 日程 ----------
  console.log("\n=== 5. 日程表 ===");
  const title = `测试安排 ${Date.now().toString().slice(-4)}`;
  await page.goto(`${BASE}/schedule/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="title"]', title);
  const dateInput = page.locator('input[name="date"]');
  await dateInput.fill(localDate(0));
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/schedule(\?|$)/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);

  const entry = await prisma.entry.findFirst({ where: { userId: demo.id, title } });
  ok(!!entry, "日程写进了数据库");
  ok(await page.getByText(title).first().isVisible(), "今天列表里能看到");

  await page.goto(`${BASE}/schedule`, { waitUntil: "networkidle" });
  const entryCard = page.locator(".card", { hasText: title });
  await entryCard.locator("button.check").click();
  await page.waitForTimeout(1200);
  ok((await prisma.entry.findUnique({ where: { id: entry.id } }))?.status === "DONE", "可以标记完成");

  // ---------- 6. 自习室 ----------
  console.log("\n=== 6. 自习室 ===");
  await page.goto(`${BASE}/rooms`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', "测试自习");
  await page.fill('input[name="duration"]', "25");
  await page.getByRole("button", { name: "创建房间" }).click();
  await page.waitForURL(/\/rooms\/[a-z0-9]{6}/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);

  const room = await prisma.room.findFirst({ where: { circleId: circle.id, name: "测试自习" }, orderBy: { createdAt: "desc" } });
  ok(!!room, `房间创建成功 ${room?.code}`);

  await page.getByRole("button", { name: "开始这一轮" }).click();
  await page.waitForTimeout(1500);
  const started = await prisma.room.findUnique({ where: { id: room.id } });
  ok(!!started?.startedAt && !!started?.endsAt, "房主开始后写入了起止时间");

  // 把结束时间挪到过去，模拟这一轮已结束
  await prisma.room.update({
    where: { id: room.id },
    data: { startedAt: new Date(Date.now() - 26 * 60_000), endsAt: new Date(Date.now() - 60_000) },
  });
  await page.goto(`${BASE}/rooms/${room.code}`, { waitUntil: "networkidle" });
  const logBtn = page.getByRole("button", { name: "记到我的时间" });
  ok(await logBtn.isVisible().catch(() => false), "结束后出现「记到我的时间」");
  if (await logBtn.isVisible().catch(() => false)) {
    await logBtn.click();
    await page.waitForTimeout(1500);
    const sess = await prisma.timerSession.findFirst({ where: { userId: demo.id, roomId: room.id } });
    ok(!!sess && sess.elapsedSeconds >= 1500, `生成了自习室记录 ${sess?.elapsedSeconds} 秒`);
  }

  // 清理
  await prisma.entry.deleteMany({ where: { title } });
  await prisma.roomMember.deleteMany({ where: { roomId: room.id } });
  await prisma.room.delete({ where: { id: room.id } });
  await prisma.pointTxn.deleteMany({ where: { refType: "manual" } });

  console.log("\n页面错误数 =", errors.length);
  errors.slice(0, 4).forEach((e) => console.log("  !", e));
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
