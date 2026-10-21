// 清空所有业务数据，保留表结构（上线前想从零开始时用）
// 用法：node scripts/wipe-data.mjs --yes
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

if (!process.argv.includes("--yes")) {
  console.log("这会删除全部数据（用户、打卡、积分、奖品、房间……）。");
  console.log("确认请加参数：node scripts/wipe-data.mjs --yes");
  process.exit(0);
}

// 按外键依赖顺序从叶子往根删
const order = [
  "redemptionParticipant",
  "redemption",
  "rewardQuota",
  "reward",
  "pointTxn",
  "wallet",
  "checkin",
  "habitStat",
  "habit",
  "notification",
  "auditLog",
  "supervision",
  "timerSession",
  "roomMember",
  "room",
  "entry",
  "skill",
  "creditRule",
  "circleMember",
  "circle",
  "user",
];

for (const name of order) {
  try {
    const r = await prisma[name].deleteMany({});
    console.log(`${name.padEnd(22)} -${r.count}`);
  } catch (e) {
    console.log(`${name.padEnd(22)} 跳过（${e.message.split("\n")[0].slice(0, 60)}）`);
  }
}

console.log("\n已清空。新用户注册后会是「没有圈子」的状态，会先走到 /welcome。");
await prisma.$disconnect();
