// 自习室：拉人 + 关闭未开始的房间；头像上传
// 用法：node scripts/smoke-room.mjs
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
  const demo = await prisma.user.findUnique({ where: { email: "demo@checkin.local" } });
  const yu = await prisma.user.findUnique({ where: { email: "xiaoyu@checkin.local" } });
  const circle = await prisma.circle.findFirst({ where: { ownerId: demo.id } });

  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const c = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await c.addCookies([{ name: "ck_session", value: `${demo.id}.${sign(demo.id)}`, domain: "127.0.0.1", path: "/" }]);
  const p = await c.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));

  console.log("\n=== 1. 建房间 → 拉圈内人 → 关闭 ===");
  await p.goto(`${BASE}/rooms`, { waitUntil: "networkidle" });
  await p.fill('input[name="name"]', "测试房间");
  await p.getByRole("button", { name: "创建房间" }).click();
  await p.waitForURL(/\/rooms\/[a-z0-9]{6}/, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(900);

  const room = await prisma.room.findFirst({
    where: { circleId: circle.id, name: "测试房间" },
    orderBy: { createdAt: "desc" },
  });
  ok(!!room, `房间创建 ${room?.code}`);
  ok(room?.status === "OPEN", `状态 ${room?.status}`);

  const invited = await prisma.roomMember.count({ where: { roomId: room.id, userId: yu.id } });
  if (!invited) {
    const btn = p.getByRole("button", { name: "拉进来" }).first();
    ok(await btn.isVisible().catch(() => false), "房主能看到「拉进来」");
    await btn.click();
    await p.waitForTimeout(1200);
  }
  ok((await prisma.roomMember.count({ where: { roomId: room.id, userId: yu.id } })) === 1, "小雨被拉进房间");
  const note = await prisma.notification.findFirst({
    where: { userId: yu.id, title: { contains: "自习室" } },
    orderBy: { createdAt: "desc" },
  });
  ok(!!note, `小雨收到通知：${note?.title}`);

  // 未开始的房间也要能关
  const closeBtn = p.getByRole("button", { name: "关闭房间" });
  ok(await closeBtn.isVisible().catch(() => false), "未开始的房间也有「关闭房间」");
  await closeBtn.click();
  await p.waitForTimeout(1400);
  const closed = await prisma.room.findUnique({ where: { id: room.id } });
  ok(closed?.status === "CLOSED", `关闭后状态 ${closed?.status}`);

  console.log("\n=== 2. 改头像 ===");
  await p.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  const before = (await prisma.user.findUnique({ where: { id: demo.id } }))?.avatarUrl ?? null;
  await p.setInputFiles('input[name="avatar"]', "public/mascot/hello.png");
  await p.getByRole("button", { name: "保存账号" }).click();
  await p.waitForTimeout(1600);
  const after = (await prisma.user.findUnique({ where: { id: demo.id } }))?.avatarUrl ?? null;
  ok(!!after && after !== before, `头像已更新：${after}`);

  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const img = await p.locator(".header img").count();
  ok(img >= 1, "首页头像变成了图片");

  // 清理
  await prisma.roomMember.deleteMany({ where: { roomId: room.id } });
  await prisma.room.delete({ where: { id: room.id } });
  await prisma.user.update({ where: { id: demo.id }, data: { avatarUrl: before } });

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
