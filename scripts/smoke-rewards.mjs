// 奖品 / 兑换 / 合兑 端到端测试（自带数据准备，可重复跑）
// 用法：node scripts/smoke-rewards.mjs
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const BASE = "http://127.0.0.1:3100";
const SECRET = process.env.AUTH_SECRET ?? "dev-only-please-change-in-production-8f3a2c";
const prisma = new PrismaClient();
const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("base64url");
const cookieOf = (u) => `ck_session=${u.id}.${sign(u.id)}`;

const DEMO_BALANCE = 2000;
const YU_BALANCE = 1200;

async function get(path, user) {
  return fetch(BASE + path, { headers: { cookie: cookieOf(user) }, redirect: "manual" });
}

/** 找到"表格里包含某个字段=某个值"的那个 form，返回它的 server action id */
function actionFor(html, fieldName, valueContains) {
  const forms = html.split("<form").slice(1);
  for (const f of forms) {
    if (!f.includes(`name="${fieldName}"`)) continue;
    if (valueContains && !f.includes(valueContains)) continue;
    const id = f.match(/\$ACTION_ID_([a-f0-9]+)/)?.[1];
    if (id) return id;
  }
  return null;
}

async function post(path, user, fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  return fetch(BASE + path, {
    method: "POST",
    headers: { cookie: cookieOf(user), origin: BASE },
    body: fd,
    redirect: "manual",
  });
}

let failures = 0;
function ok(cond, msg) {
  console.log((cond ? "✅ " : "❌ ") + msg);
  if (!cond) failures++;
}

async function main() {
  const demo = await prisma.user.findUnique({ where: { email: "demo@checkin.local" } });
  const yu = await prisma.user.findUnique({ where: { email: "xiaoyu@checkin.local" } });
  if (!demo || !yu) throw new Error("先跑 seed 脚本");

  const circle = await prisma.circle.findFirst({ where: { ownerId: demo.id } });

  // ---- 数据准备：清掉兑换记录，把余额摆到固定值 ----
  await prisma.redemption.deleteMany({ where: { circleId: circle.id } });
  await prisma.pointTxn.deleteMany({ where: { wallet: { circleId: circle.id } } });
  for (const [uid, bal] of [[demo.id, DEMO_BALANCE], [yu.id, YU_BALANCE]]) {
    await prisma.wallet.update({
      where: { circleId_userId: { circleId: circle.id, userId: uid } },
      data: { balance: bal, totalEarned: bal, totalSpent: 0 },
    });
  }
  // 库存/状态回到初始，保证可重复跑
  const STOCK = { "那副一直在看的耳机": 1, "一场电影": 1 };
  const all = await prisma.reward.findMany({ where: { circleId: circle.id } });
  for (const r of all) {
    await prisma.reward.update({
      where: { id: r.id },
      data: { stock: STOCK[r.title] ?? null, status: "ACTIVE" },
    });
  }

  const rewards = await prisma.reward.findMany({ where: { circleId: circle.id } });
  const milktea = rewards.find((r) => r.title === "周末一杯奶茶");
  const headphone = rewards.find((r) => r.title === "那副一直在看的耳机");
  const game = rewards.find((r) => r.title === "多玩 1 小时游戏");
  const book = rewards.find((r) => r.title === "挑一本书");
  const movie = rewards.find((r) => r.title === "一场电影");

  const balanceOf = async (uid) =>
    (await prisma.wallet.findUnique({ where: { circleId_userId: { circleId: circle.id, userId: uid } } })).balance;

  console.log("\n=== 1. 单人兑换（不审核，直接成立） ===");
  let html = await (await get(`/rewards/${milktea.id}`, demo)).text();
  const redeemId = actionFor(html, "rewardId", milktea.id);
  ok(!!redeemId, "详情页渲染出兑换表单");
  let res = await post(`/rewards/${milktea.id}`, demo, { [`$ACTION_ID_${redeemId}`]: "", rewardId: milktea.id });
  console.log("   POST =>", res.status);
  const after1 = await balanceOf(demo.id);
  const order1 = await prisma.redemption.findFirst({
    where: { rewardId: milktea.id, initiatorId: demo.id },
    orderBy: { createdAt: "desc" },
  });
  ok(after1 === DEMO_BALANCE - milktea.pointsCost, `余额 ${DEMO_BALANCE} → ${after1}`);
  ok(!!order1 && order1.status === "APPROVED", `兑换单状态 ${order1?.status}`);
  ok(!!order1?.snapshot?.title, "兑换单里有商品快照");
  const txn1 = await prisma.pointTxn.findFirst({ where: { refId: order1.id, type: "SPEND_REDEEM" } });
  ok(txn1?.delta === -milktea.pointsCost && txn1.balanceAfter === after1, `流水 ${txn1?.delta}，余额一致`);

  console.log("\n=== 2. 限兑次数（奶茶每人限兑 2 次） ===");
  html = await (await get(`/rewards/${milktea.id}`, demo)).text();
  ok(html.includes("已兑 1 次"), "详情页显示已兑次数");
  res = await post(`/rewards/${milktea.id}`, demo, { [`$ACTION_ID_${redeemId}`]: "", rewardId: milktea.id });
  ok((await prisma.redemption.count({ where: { rewardId: milktea.id, initiatorId: demo.id } })) === 2, "第二次仍然允许");
  res = await post(`/rewards/${milktea.id}`, demo, { [`$ACTION_ID_${redeemId}`]: "", rewardId: milktea.id });
  const dup = await prisma.redemption.count({ where: { rewardId: milktea.id, initiatorId: demo.id } });
  ok(dup === 2, `第三次被拦下（订单数 ${dup}）`);
  ok((await balanceOf(demo.id)) === DEMO_BALANCE - milktea.pointsCost * 2, "只扣了两次的分");

  console.log("\n=== 3. 合兑：发起 → 对方补分 → 凑齐 ===");
  const beforeGroup = await balanceOf(demo.id);
  html = await (await get(`/rewards/${headphone.id}`, demo)).text();
  ok(html.includes("发起合兑"), "余额不够时给出「发起合兑」入口");
  const startId = actionFor(html, "myPoints", headphone.id);
  ok(!!startId, "渲染出「发起合兑」表单");
  await post(`/rewards/${headphone.id}`, demo, { [`$ACTION_ID_${startId}`]: "", rewardId: headphone.id, myPoints: 800 });

  let group = await prisma.redemption.findFirst({
    where: { rewardId: headphone.id, type: "GROUP" },
    orderBy: { createdAt: "desc" },
    include: { participants: true },
  });
  ok(group?.status === "OPEN" && group.raisedPoints === 800, `合兑单 ${group?.status}，已凑 ${group?.raisedPoints}/${group?.pointsCost}`);
  ok((await balanceOf(demo.id)) === beforeGroup - 800, "发起人先扣了 800");

  html = await (await get(`/rewards/${headphone.id}`, yu)).text();
  const joinId = actionFor(html, "redemptionId", group.id);
  ok(!!joinId, "小雨看到「加入合兑」表单");

  const remaining = group.pointsCost - group.raisedPoints;
  res = await post(`/rewards/${headphone.id}`, yu, { [`$ACTION_ID_${joinId}`]: "", redemptionId: group.id, points: remaining });
  console.log("   POST 加入 =>", res.status);

  group = await prisma.redemption.findUnique({ where: { id: group.id }, include: { participants: true } });
  ok(group.status === "APPROVED", `凑齐后状态 ${group.status}`);
  ok(group.participants.length === 2, `出资人 ${group.participants.length} 位`);
  ok((await balanceOf(yu.id)) === YU_BALANCE - remaining, `小雨 ${YU_BALANCE} → ${await balanceOf(yu.id)}`);

  console.log("\n=== 4. 管理员标记发放 ===");
  html = await (await get("/admin/orders", demo)).text();
  const fulfillId = actionFor(html, "redemptionId", group.id);
  ok(!!fulfillId, "管理端有该单的发放按钮");
  res = await post("/admin/orders", demo, { [`$ACTION_ID_${fulfillId}`]: "", redemptionId: group.id });
  const fulfilled = await prisma.redemption.findUnique({ where: { id: group.id } });
  ok(fulfilled.status === "FULFILLED", `状态 ${fulfilled.status}`);

  console.log("\n=== 5. 领取人确认完成 ===");
  html = await (await get("/orders", demo)).text();
  const completeId = actionFor(html, "redemptionId", group.id);
  ok(!!completeId, "订单页有「确认收到」");
  await post("/orders", demo, { [`$ACTION_ID_${completeId}`]: "", redemptionId: group.id });
  ok((await prisma.redemption.findUnique({ where: { id: group.id } })).status === "COMPLETED", "状态 COMPLETED");

  console.log("\n=== 6. 取消并退分（实物单） ===");
  const w0 = await balanceOf(demo.id);
  html = await (await get(`/rewards/${book.id}`, demo)).text();
  const rid = actionFor(html, "rewardId", book.id);
  await post(`/rewards/${book.id}`, demo, { [`$ACTION_ID_${rid}`]: "", rewardId: book.id });
  const bookOrder = await prisma.redemption.findFirst({
    where: { rewardId: book.id, initiatorId: demo.id },
    orderBy: { createdAt: "desc" },
  });
  ok(bookOrder?.status === "APPROVED", `实物单成立后状态 ${bookOrder?.status}`);
  ok((await balanceOf(demo.id)) === w0 - book.pointsCost, "兑换后扣了分");
  html = await (await get("/orders", demo)).text();
  const cancelId = actionFor(html, "redemptionId", bookOrder.id);
  ok(!!cancelId, "订单页有取消按钮");
  await post("/orders", demo, { [`$ACTION_ID_${cancelId}`]: "", redemptionId: bookOrder.id });
  const cancelled = await prisma.redemption.findUnique({ where: { id: bookOrder.id } });
  ok(cancelled.status === "CANCELLED", `状态 ${cancelled.status}`);
  ok((await balanceOf(demo.id)) === w0, `积分退回：${w0 - book.pointsCost} → ${await balanceOf(demo.id)}`);

  console.log("\n=== 7. 虚拟奖品自动履约 ===");
  const w1 = await balanceOf(demo.id);
  html = await (await get(`/rewards/${game.id}`, demo)).text();
  const gid = actionFor(html, "rewardId", game.id);
  await post(`/rewards/${game.id}`, demo, { [`$ACTION_ID_${gid}`]: "", rewardId: game.id });
  const gameOrder = await prisma.redemption.findFirst({
    where: { rewardId: game.id, initiatorId: demo.id },
    orderBy: { createdAt: "desc" },
  });
  ok(gameOrder?.status === "FULFILLED", `虚拟奖品直接履约：${gameOrder?.status}`);
  html = await (await get("/orders", demo)).text();
  const doneId = actionFor(html, "redemptionId", gameOrder.id);
  await post("/orders", demo, { [`$ACTION_ID_${doneId}`]: "", redemptionId: gameOrder.id });
  ok((await prisma.redemption.findUnique({ where: { id: gameOrder.id } })).status === "COMPLETED", "确认收到后 COMPLETED");
  ok((await balanceOf(demo.id)) === w1 - game.pointsCost, "虚拟单照常扣分");

  console.log("\n=== 8. 合兑超时解散 ===");
  // 把余额压到不够买电影（600），才会出现「发起合兑」
  await prisma.wallet.update({
    where: { circleId_userId: { circleId: circle.id, userId: demo.id } },
    data: { balance: 500 },
  });
  html = await (await get(`/rewards/${movie.id}`, demo)).text();
  const sid = actionFor(html, "myPoints", movie.id);
  ok(!!sid, "电影也能发起合兑");
  await post(`/rewards/${movie.id}`, demo, { [`$ACTION_ID_${sid}`]: "", rewardId: movie.id, myPoints: 300 });
  const g2 = await prisma.redemption.findFirst({
    where: { rewardId: movie.id, type: "GROUP" },
    orderBy: { createdAt: "desc" },
  });
  const balBeforeExpire = await balanceOf(demo.id);
  await prisma.redemption.update({ where: { id: g2.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await get(`/rewards/${movie.id}`, demo); // 打开页面触发惰性过期
  const expired = await prisma.redemption.findUnique({ where: { id: g2.id } });
  ok(expired.status === "EXPIRED", `状态 ${expired.status}`);
  ok((await balanceOf(demo.id)) === balBeforeExpire + 300, "300 分自动退回");
  const parts = await prisma.redemptionParticipant.findMany({ where: { redemptionId: g2.id } });
  ok(parts.every((p) => p.status === "RELEASED"), "出资份额已释放");

  console.log("\n=== 9. 归档 ===");
  html = await (await get("/admin/rewards", demo)).text();
  const archId = actionFor(html, "id", book.id);
  ok(!!archId, "管理列表有归档按钮");
  await post("/admin/rewards", demo, { [`$ACTION_ID_${archId}`]: "", id: book.id, status: "ARCHIVED" });
  ok((await prisma.reward.findUnique({ where: { id: book.id } })).status === "ARCHIVED", "状态 ARCHIVED");
  ok(!(await (await get("/rewards", demo)).text()).includes("挑一本书"), "归档后商城不显示");
  ok((await prisma.redemption.count({ where: { rewardId: book.id } })) > 0, "有历史订单也允许归档（不删数据）");

  console.log(`\n${failures === 0 ? "全部通过 🎉" : `有 ${failures} 项失败`}`);
  await prisma.$disconnect();
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(async (e) => {
  console.error("❌", e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
