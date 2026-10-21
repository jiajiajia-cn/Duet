// 双账号全流程测试：把"必须两个人才能完成"的功能走一遍
// 用法：node scripts/smoke-duo.mjs
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://127.0.0.1:3100";
const SECRET = process.env.AUTH_SECRET ?? "dev-only-please-change-in-production-8f3a2c";
const prisma = new PrismaClient();
const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("base64url");
const stamp = Date.now().toString().slice(-5);

let failures = 0;
const ok = (c, m) => {
  console.log((c ? "✅ " : "❌ ") + m);
  if (!c) failures++;
};

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

async function ctxFor(browser, user) {
  const c = await browser.newContext({ viewport: { width: 430, height: 932 } });
  if (user) {
    await c.addCookies([{ name: "ck_session", value: `${user.id}.${sign(user.id)}`, domain: "127.0.0.1", path: "/" }]);
  }
  return c;
}

async function main() {
  const demo = await prisma.user.findUnique({ where: { email: "demo@checkin.local" } });
  const yu = await prisma.user.findUnique({ where: { email: "xiaoyu@checkin.local" } });
  const circle = await prisma.circle.findFirst({ where: { ownerId: demo.id } });

  // 两个人都指到这个圈子
  for (const u of [demo, yu]) {
    await prisma.user.update({ where: { id: u.id }, data: { activeCircleId: circle.id } });
  }
  const balance = async (uid) =>
    (await prisma.wallet.findUnique({ where: { circleId_userId: { circleId: circle.id, userId: uid } } })).balance;

  // 把余额摆到固定值，避免受之前跑过的数据影响
  const original = { demo: await balance(demo.id), yu: await balance(yu.id) };
  for (const [uid, v] of [[demo.id, 1200], [yu.id, 3000]]) {
    await prisma.wallet.update({
      where: { circleId_userId: { circleId: circle.id, userId: uid } },
      data: { balance: v, totalEarned: v },
    });
  }

  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const dCtx = await ctxFor(browser, demo);
  const yCtx = await ctxFor(browser, yu);
  const dp = await dCtx.newPage();
  const yp = await yCtx.newPage();
  const errs = [];
  dp.on("pageerror", (e) => errs.push("demo: " + e.message.slice(0, 60)));
  yp.on("pageerror", (e) => errs.push("yu: " + e.message.slice(0, 60)));

  // ========== 1. 手动调分（圈主给成员） ==========
  console.log("\n=== 1. 圈主给成员手动加分 ===");
  const yBefore = await balance(yu.id);
  await dp.goto(`${BASE}/admin/members`, { waitUntil: "networkidle" });
  const yCard = dp.locator(".card", { hasText: "小雨" });
  await yCard.locator('input[name="delta"]').fill("2000");
  await yCard.locator('input[name="reason"]').fill("测试：给点分");
  await yCard.getByRole("button", { name: "调整积分" }).click();
  await dp.waitForTimeout(1400);
  ok((await balance(yu.id)) === yBefore + 2000, `小雨 ${yBefore} → ${await balance(yu.id)}`);

  await yp.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
  ok(await yp.getByText(/收到 2000 分/).first().isVisible().catch(() => false), "小雨收到了加分通知");

  // ========== 2. 合兑（一人出不起，两个人凑） ==========
  console.log("\n=== 2. 合兑：发起 → 对方补分 → 凑齐 ===");
  const reward = await prisma.reward.create({
    data: {
      circleId: circle.id,
      createdBy: demo.id,
      title: `双人奖品 ${stamp}`,
      pointsCost: 3000,
      stock: 1,
      limitPerUser: 1,
      category: "测试",
      fulfillmentType: "OFFLINE",
      status: "ACTIVE",
    },
  });

  await dp.goto(`${BASE}/rewards/${reward.id}`, { waitUntil: "networkidle" });
  await dp.locator('input[name="myPoints"]').fill("500");
  await dp.getByRole("button", { name: "发起合兑" }).click();
  await dp.waitForTimeout(1500);

  let group = await prisma.redemption.findFirst({
    where: { rewardId: reward.id, type: "GROUP" },
    orderBy: { createdAt: "desc" },
    include: { participants: true },
  });
  ok(group?.status === "OPEN" && group?.raisedPoints === 500, `合兑单 ${group?.status}，已凑 ${group?.raisedPoints}/3000`);

  await yp.goto(`${BASE}/rewards/${reward.id}`, { waitUntil: "networkidle" });
  const joinBtn = yp.getByRole("button", { name: /凑齐它|出 \d+ 分/ });
  ok(await joinBtn.isVisible().catch(() => false), "小雨能看到凑分按钮");
  await joinBtn.click();
  await yp.waitForTimeout(1600);

  group = await prisma.redemption.findUnique({ where: { id: group.id }, include: { participants: true } });
  ok(group.status === "APPROVED", `凑齐后 ${group.status}`);
  ok(group.participants.length === 2, `出资人 ${group.participants.length} 位`);

  // ========== 3. 发放 → 确认 ==========
  console.log("\n=== 3. 圈主标记发放 → 领取人确认 ===");
  await dp.goto(`${BASE}/admin/orders`, { waitUntil: "networkidle" });
  const orderCard = dp.locator(".card", { hasText: `双人奖品 ${stamp}` });
  await orderCard.getByRole("button", { name: "标记已发放" }).click();
  await dp.waitForTimeout(1400);
  ok((await prisma.redemption.findUnique({ where: { id: group.id } })).status === "FULFILLED", "已发放");

  await dp.goto(`${BASE}/orders`, { waitUntil: "networkidle" });
  const myOrder = dp.locator(".card", { hasText: `双人奖品 ${stamp}` });
  await myOrder.getByRole("button", { name: "确认收到" }).click();
  await dp.waitForTimeout(1400);
  ok((await prisma.redemption.findUnique({ where: { id: group.id } })).status === "COMPLETED", "已完成");

  // ========== 4. 一起打卡 ==========
  console.log("\n=== 4. 一起打卡：两个人都打才加分 ===");
  const duo = await prisma.habit.create({
    data: {
      circleId: circle.id,
      ownerId: demo.id,
      title: `双人习惯 ${stamp}`,
      icon: "🐶",
      type: "CHECK",
      frequency: { kind: "daily" },
      pointsPerCheckin: 20,
      collaborative: true,
      sortOrder: 0,
    },
  });
  const b1 = { d: await balance(demo.id), y: await balance(yu.id) };

  await dp.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await dp.locator(".habit", { hasText: `双人习惯 ${stamp}` }).locator("button.check").click();
  await dp.waitForTimeout(1400);
  ok((await balance(demo.id)) === b1.d, "只有一个人打时不加分");

  await yp.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await yp.locator(".habit", { hasText: `双人习惯 ${stamp}` }).locator("button.check").click();
  await yp.waitForTimeout(1600);
  ok((await balance(demo.id)) === b1.d + 20, `小满 +20（${b1.d} → ${await balance(demo.id)}）`);
  ok((await balance(yu.id)) === b1.y + 20, `小雨 +20（${b1.y} → ${await balance(yu.id)}）`);

  // ========== 5. 监督打卡 ==========
  console.log("\n=== 5. 监督打卡：一个人打，另一个人确认 ===");
  const watched = await prisma.habit.create({
    data: {
      circleId: circle.id,
      ownerId: demo.id,
      title: `要确认的习惯 ${stamp}`,
      icon: "📸",
      type: "CHECK",
      frequency: { kind: "daily" },
      pointsPerCheckin: 12,
      needsReview: true,
      sortOrder: 1,
    },
  });
  const b2 = await balance(demo.id);
  await dp.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await dp.locator(".habit", { hasText: `要确认的习惯 ${stamp}` }).locator("button.check").click();
  await dp.waitForTimeout(1400);

  const pend = await prisma.checkin.findFirst({ where: { habitId: watched.id, userId: demo.id } });
  ok(pend?.status === "PENDING" && pend?.pointsAwarded === 0, `待确认，先不发分（${pend?.status}）`);

  await yp.goto(`${BASE}/review`, { waitUntil: "networkidle" });
  const revCard = yp.locator(".card", { hasText: `要确认的习惯 ${stamp}` });
  await revCard.getByRole("button", { name: /确认/ }).click();
  await yp.waitForTimeout(1500);
  const approved = await prisma.checkin.findUnique({ where: { id: pend.id } });
  ok(approved.status === "APPROVED" && approved.pointsAwarded === 12, `确认后发 ${approved.pointsAwarded} 分`);
  ok((await balance(demo.id)) === b2 + 12, `小满余额 ${b2} → ${await balance(demo.id)}`);

  // ========== 6. 自习室 ==========
  console.log("\n=== 6. 自习室：拉人 → 开始 → 各自记账 ===");
  await dp.goto(`${BASE}/rooms`, { waitUntil: "networkidle" });
  await dp.fill('input[name="name"]', `双人自习 ${stamp}`);
  await dp.getByRole("button", { name: "创建房间" }).click();
  await dp.waitForURL(/\/rooms\/[a-z0-9]{6}/, { timeout: 20000 }).catch(() => {});
  await dp.waitForTimeout(900);

  const room = await prisma.room.findFirst({
    where: { circleId: circle.id, name: `双人自习 ${stamp}` },
    orderBy: { createdAt: "desc" },
  });
  ok(!!room, `房间 ${room?.code}`);

  const inviteBtn = dp.getByRole("button", { name: "拉进来" });
  if (await inviteBtn.count()) {
    await inviteBtn.first().click();
    await dp.waitForTimeout(1200);
  }
  ok((await prisma.roomMember.count({ where: { roomId: room.id, userId: yu.id } })) === 1, "小雨被拉进房间");

  await dp.getByRole("button", { name: "开始这一轮" }).click();
  await dp.waitForTimeout(1400);
  const started = await prisma.room.findUnique({ where: { id: room.id } });
  ok(!!started?.endsAt, "房间已开始");

  // 把时间挪到过去，模拟跑完
  await prisma.room.update({
    where: { id: room.id },
    data: { startedAt: new Date(Date.now() - 26 * 60_000), endsAt: new Date(Date.now() - 60_000) },
  });
  for (const [page, name] of [[dp, "小满"], [yp, "小雨"]]) {
    await page.goto(`${BASE}/rooms/${room.code}`, { waitUntil: "networkidle" });
    const log = page.getByRole("button", { name: "记到我的时间" });
    if (await log.isVisible().catch(() => false)) {
      await log.click();
      await page.waitForTimeout(1300);
    } else {
      ok(false, `${name} 没看到「记到我的时间」`);
    }
  }
  const dSess = await prisma.timerSession.findFirst({ where: { userId: demo.id, roomId: room.id } });
  const ySess = await prisma.timerSession.findFirst({ where: { userId: yu.id, roomId: room.id } });
  ok(!!dSess && !!ySess, `两人各生成记录：${dSess?.elapsedSeconds}s / ${ySess?.elapsedSeconds}s`);

  // ========== 7. 邀请码加入（第三个人） ==========
  console.log("\n=== 7. 用邀请码加入圈子 ===");
  const fresh = await ctxFor(browser, null);
  const np = await fresh.newPage();
  const email = `duo${stamp}@checkin.local`;
  await prisma.user.deleteMany({ where: { email } });
  await np.goto(`${BASE}/join/${circle.inviteCode}`, { waitUntil: "networkidle" });
  ok(await np.getByRole("link", { name: "注册并加入" }).isVisible().catch(() => false), "邀请页给出「注册并加入」");
  await np.getByRole("link", { name: "注册并加入" }).click();
  await np.waitForURL(/\/register/, { timeout: 20000 }).catch(() => {});
  await np.waitForTimeout(600);

  await np.fill('input[name="nickname"]', `阿豆${stamp}`);
  await np.fill('input[name="email"]', email);
  await np.fill('input[name="password"]', "duo12345");
  await np.click('button[type="submit"]');
  await np.waitForURL((u) => !u.pathname.startsWith("/register"), { timeout: 20000 }).catch(() => {});
  await np.waitForTimeout(1200);

  const newUser = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
  ok(!!newUser, "注册成功");
  ok(newUser?.memberships.some((m) => m.circleId === circle.id && m.status === "ACTIVE"), "自动加入了那个圈子");
  ok(newUser?.activeCircleId === circle.id, "当前圈子指向它");
  ok(await np.getByText("今天").first().isVisible().catch(() => false), "注册后直接进首页");

  // ========== 8. 催办（对新来的成员） ==========
  console.log("\n=== 8. 催办 ===");
  await prisma.notification.deleteMany({ where: { userId: newUser.id, type: "NUDGE" } });
  await dp.goto(`${BASE}/review`, { waitUntil: "networkidle" });
  const nudgeRow = dp.locator(".habit", { hasText: `阿豆${stamp}` });
  ok((await nudgeRow.count()) > 0, "没打卡的新成员出现在「今天还没打卡」里");
  if (await nudgeRow.count()) {
    await nudgeRow.first().getByRole("button", { name: "催一下" }).click();
    await dp.waitForTimeout(1300);
    const n = await prisma.notification.findFirst({ where: { userId: newUser.id, type: "NUDGE" } });
    ok(!!n, `对方收到催办：${n?.title}`);
    ok((n?.body ?? "").includes("小满"), "催办里带着是谁催的");
  }

  // ========== 清理 ==========
  await prisma.redemptionParticipant.deleteMany({ where: { redemption: { rewardId: reward.id } } });
  await prisma.redemption.deleteMany({ where: { rewardId: reward.id } });
  await prisma.reward.delete({ where: { id: reward.id } });
  await prisma.checkin.deleteMany({ where: { habitId: { in: [duo.id, watched.id] } } });
  await prisma.habitStat.deleteMany({ where: { habitId: { in: [duo.id, watched.id] } } });
  await prisma.habit.deleteMany({ where: { id: { in: [duo.id, watched.id] } } });
  await prisma.roomMember.deleteMany({ where: { roomId: room.id } });
  await prisma.room.delete({ where: { id: room.id } });
  await prisma.timerSession.deleteMany({ where: { roomId: room.id } });
  if (newUser) {
    await prisma.circleMember.deleteMany({ where: { userId: newUser.id } });
    await prisma.wallet.deleteMany({ where: { userId: newUser.id } });
    await prisma.user.delete({ where: { id: newUser.id } });
  }

  // 恢复余额
  for (const [uid, v] of [[demo.id, original.demo], [yu.id, original.yu]]) {
    await prisma.wallet.update({
      where: { circleId_userId: { circleId: circle.id, userId: uid } },
      data: { balance: v },
    });
  }

  console.log("\n页面错误数 =", errs.length, errs.slice(0, 3).join(" | "));
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
