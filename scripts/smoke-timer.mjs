// 计时器端到端测试（真浏览器点，服务端结算）
// 用法：node scripts/smoke-timer.mjs
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

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "demo@checkin.local" } });
  const circle = await prisma.circle.findFirst({ where: { ownerId: user.id } });

  // 清掉进行中的会话，余额摆固定
  await prisma.timerSession.deleteMany({
    where: { userId: user.id, status: { in: ["RUNNING", "PAUSED"] } },
  });
  await prisma.wallet.update({
    where: { circleId_userId: { circleId: circle.id, userId: user.id } },
    data: { balance: 1000 },
  });

  const guitar = await prisma.skill.findFirst({ where: { circleId: circle.id, ownerId: user.id, name: "吉他" } });
  const habit = await prisma.habit.findFirst({ where: { circleId: circle.id, ownerId: user.id, type: "TIMED" } });
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

  console.log("\n=== 1. 开始计时（25 分钟倒计时，归到吉他） ===");
  await page.goto(`${BASE}/timer`, { waitUntil: "networkidle" });
  // 第二个 select 是"关联习惯"，先清空它，避免走自动打卡分支
  const selects = page.locator("select");
  if ((await selects.count()) >= 2) await selects.nth(1).selectOption("");
  await page.getByRole("button", { name: "开始专注" }).click();
  await page.waitForTimeout(1200);

  let active = await prisma.timerSession.findFirst({
    where: { userId: user.id, status: { in: ["RUNNING", "PAUSED"] } },
  });
  ok(!!active, "数据库里出现了进行中的会话");
  ok(active?.status === "RUNNING", `状态 ${active?.status}`);
  ok(active?.plannedSeconds === 25 * 60, `计划 ${active?.plannedSeconds} 秒`);
  ok(active?.skillId === guitar?.id, "归到了技能「吉他」");

  console.log("\n=== 2. 暂停 / 继续 ===");
  await page.getByRole("button", { name: "暂停" }).click();
  await page.waitForTimeout(1000);
  active = await prisma.timerSession.findUnique({ where: { id: active.id } });
  ok(active.status === "PAUSED" && !!active.pausedAt, "暂停记下了 pausedAt");

  await page.getByRole("button", { name: "继续" }).click();
  await page.waitForTimeout(1000);
  active = await prisma.timerSession.findUnique({ where: { id: active.id } });
  ok(active.status === "RUNNING" && active.pausedAt === null, "继续后 pausedAt 清空并累加暂停时长");
  ok(active.pausedTotalSeconds >= 1, `暂停累计 ${active.pausedTotalSeconds} 秒`);

  console.log("\n=== 3. 结束（把开始时间往前挪 50 分钟，模拟真的专注了 50 分钟） ===");
  const before = await balance();
  const skillBefore = await prisma.skill.findUnique({ where: { id: guitar.id } });
  await prisma.timerSession.update({
    where: { id: active.id },
    data: { startedAt: new Date(Date.now() - 50 * 60_000) },
  });
  await page.getByRole("button", { name: "结束" }).click();
  await page.waitForTimeout(1800);

  const done = await prisma.timerSession.findUnique({ where: { id: active.id } });
  const after = await balance();
  const skillAfter = await prisma.skill.findUnique({ where: { id: guitar.id } });
  ok(done.status === "COMPLETED", `状态 ${done.status}`);
  ok(done.elapsedSeconds >= 49 * 60 && done.elapsedSeconds <= 51 * 60, `净时长 ${done.elapsedSeconds} 秒（≈50 分钟）`);
  ok(done.pointsAwarded === 20, `按阶梯给分 ${done.pointsAwarded}（45 分钟档 = 20）`);
  ok(after === before + 20, `余额 ${before} → ${after}`);
  ok(skillAfter.totalSeconds >= skillBefore.totalSeconds, `技能累计 ${skillBefore.totalSeconds} → ${skillAfter.totalSeconds}`);
  const txn = await prisma.pointTxn.findFirst({ where: { refId: done.id, type: "EARN_TIMER" } });
  ok(txn?.delta === 20 && txn.balanceAfter === after, "写了计时流水且余额一致");

  console.log("\n=== 4. 计时型习惯：达标自动打卡，且不重复发分 ===");
  await prisma.checkin.deleteMany({ where: { habitId: habit.id, userId: user.id } });
  await prisma.timerSession.deleteMany({ where: { userId: user.id, status: { in: ["RUNNING", "PAUSED"] } } });

  await page.goto(`${BASE}/timer`, { waitUntil: "networkidle" });
  const s2 = page.locator("select");
  if ((await s2.count()) >= 2) await s2.nth(1).selectOption(habit.id);
  await page.getByRole("button", { name: "开始专注" }).click();
  await page.waitForTimeout(1000);

  const active2 = await prisma.timerSession.findFirst({
    where: { userId: user.id, status: { in: ["RUNNING", "PAUSED"] } },
  });
  ok(active2?.habitId === habit.id, "会话关联到了「练琴」");

  const b2 = await balance();
  await prisma.timerSession.update({
    where: { id: active2.id },
    data: { startedAt: new Date(Date.now() - 50 * 60_000) },
  });
  await page.getByRole("button", { name: "结束" }).click();
  await page.waitForTimeout(1800);

  const done2 = await prisma.timerSession.findUnique({ where: { id: active2.id } });
  const checkin = await prisma.checkin.findFirst({
    where: { habitId: habit.id, userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const b3 = await balance();
  ok(!!checkin, "自动生成了打卡记录");
  ok(checkin?.source === "TIMER", `打卡来源 ${checkin?.source}`);
  ok(done2.pointsAwarded === 0, `计时这一侧不再发分（${done2.pointsAwarded}）`);
  ok(b3 === b2 + (habit?.pointsPerCheckin ?? 0), `余额只加了习惯分 ${habit?.pointsPerCheckin}：${b2} → ${b3}`);

  console.log("\n=== 5. 太短的会话直接丢弃 ===");
  await prisma.timerSession.deleteMany({ where: { userId: user.id, status: { in: ["RUNNING", "PAUSED"] } } });
  const countBefore = await prisma.timerSession.count({ where: { userId: user.id } });
  await page.goto(`${BASE}/timer`, { waitUntil: "networkidle" });
  const s3 = page.locator("select");
  if ((await s3.count()) >= 2) await s3.nth(1).selectOption("");
  await page.getByRole("button", { name: "开始专注" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "结束" }).click();
  await page.waitForTimeout(1500);
  const countAfter = await prisma.timerSession.count({ where: { userId: user.id } });
  ok(countAfter === countBefore, `30 秒内的会话没有留痕（${countBefore} → ${countAfter}）`);

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
