// 端到端冒烟测试：不点浏览器，直接走 HTTP + Server Action
// 用法：node scripts/smoke.mjs
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const BASE = "http://127.0.0.1:3100";
const SECRET = process.env.AUTH_SECRET ?? "dev-only-please-change-in-production-8f3a2c";
const prisma = new PrismaClient();

function sign(v) {
  return crypto.createHmac("sha256", SECRET).update(v).digest("base64url");
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "demo@checkin.local" } });
  if (!user) throw new Error("先跑 node scripts/seed.mjs");

  const cookie = `ck_session=${user.id}.${sign(user.id)}`;
  const get = (path) => fetch(BASE + path, { headers: { cookie }, redirect: "manual" });

  // 1. 首页
  let res = await get("/");
  let html = await res.text();
  console.log("GET / =>", res.status, "| 含习惯:", html.includes("早起"));

  // 2. 找打卡表单
  const actionId = html.match(/\$ACTION_ID_([a-f0-9]+)/)?.[1];
  const habitId = html.match(/name="habitId" value="([^"]+)"/)?.[1];
  // 挑一个"单独打卡就给分"的习惯（跳过一起打卡的）
  const solo = await prisma.habit.findFirst({
    where: { ownerId: user.id, status: "ACTIVE", collaborative: false, type: { in: ["CHECK", "NEGATIVE"] } },
    orderBy: { sortOrder: "asc" },
  });
  const targetId = solo?.id ?? habitId;
  console.log("actionId =", actionId, "| habitId =", targetId);
  if (!actionId || !targetId) throw new Error("页面上没找到打卡表单");

  // 清掉今天这条记录，保证可以再打一次
  const tz = "Asia/Shanghai";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await prisma.checkin.deleteMany({ where: { habitId: targetId, userId: user.id, localDate: today } });

  const before = await prisma.wallet.findFirst({ where: { userId: user.id } });
  console.log("打卡前余额 =", before?.balance ?? 0);

  // 3. 提交打卡
  const fd = new FormData();
  fd.append(`$ACTION_ID_${actionId}`, "");
  fd.append("habitId", targetId);
  res = await fetch(BASE + "/", {
    method: "POST",
    headers: { cookie },
    body: fd,
    redirect: "manual",
  });
  console.log("POST 打卡 =>", res.status);

  // 4. 校验数据库
  const after = await prisma.wallet.findFirst({ where: { userId: user.id } });
  const txns = await prisma.pointTxn.findMany({
    where: { wallet: { userId: user.id } },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  const checkins = await prisma.checkin.count({ where: { userId: user.id } });
  const stat = await prisma.habitStat.findFirst({ where: { userId: user.id } });

  console.log("打卡后余额 =", after?.balance ?? 0);
  console.log("打卡条数 =", checkins, "| 连续天数 =", stat?.currentStreak ?? 0);
  console.log("最近流水 =", txns.map((t) => `${t.type} ${t.delta}`).join(" | "));

  const ok = (after?.balance ?? 0) > (before?.balance ?? 0) && checkins > 0;
  console.log(ok ? "✅ 端到端通过" : "❌ 失败");

  // 5. 再读一次首页，确认渲染出了新余额
  res = await get("/");
  html = await res.text();
  const shown = html.match(/class="num">\s*([\d,]+)/)?.[1];
  console.log("首页显示余额 =", shown);
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
