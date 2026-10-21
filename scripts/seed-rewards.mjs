// 演示奖品 + 第二个成员（小雨），方便试合兑
// 用法：node scripts/seed-rewards.mjs
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();
const hash = (p) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
};

const REWARDS = [
  {
    title: "那副一直在看的耳机",
    description: "一直想买的那副。换到就归你，运费我出。",
    pointsCost: 1800,
    category: "实物",
    fulfillmentType: "PHYSICAL",
    stock: 1,
    limitPerUser: 1,
    image: "/uploads/demo-headphone.jpg",
  },
  {
    title: "周末一杯奶茶",
    description: "任意口味，周末限定，一个人一个月最多两次。",
    pointsCost: 120,
    category: "吃的",
    fulfillmentType: "OFFLINE",
    stock: null,
    limitPerUser: 2,
    image: "/uploads/demo-milktea.jpg",
  },
  {
    title: "多玩 1 小时游戏",
    description: "当晚可以多玩一小时，说了算。",
    pointsCost: 200,
    category: "特权",
    fulfillmentType: "VIRTUAL",
    stock: null,
    limitPerUser: 99,
    image: "/uploads/demo-game.jpg",
  },
  {
    title: "挑一本书",
    description: "书单里挑一本，我付钱。",
    pointsCost: 500,
    category: "实物",
    fulfillmentType: "PHYSICAL",
    stock: null,
    limitPerUser: 1,
    image: "/uploads/demo-book.jpg",
  },
  {
    title: "一场电影",
    description: "周末去看场电影，只此一张。",
    pointsCost: 600,
    category: "体验",
    fulfillmentType: "OFFLINE",
    stock: 1,
    limitPerUser: 1,
    image: "/uploads/demo-movie.jpg",
  },
  {
    title: "睡到自然醒",
    description: "周末不用设闹钟，谁也别叫。",
    pointsCost: 300,
    category: "特权",
    fulfillmentType: "VIRTUAL",
    stock: null,
    limitPerUser: 99,
    image: "/uploads/demo-sleep.jpg",
  },
];

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "demo@checkin.local" } });
  if (!owner) throw new Error("先跑 node scripts/seed.mjs");
  const circle = await prisma.circle.findFirst({ where: { ownerId: owner.id } });
  if (!circle) throw new Error("找不到圈子");

  // 第二个成员
  let partner = await prisma.user.findUnique({ where: { email: "xiaoyu@checkin.local" } });
  if (!partner) {
    partner = await prisma.user.create({
      data: { email: "xiaoyu@checkin.local", nickname: "小雨", passwordHash: hash("demo1234") },
    });
  }
  await prisma.circleMember.upsert({
    where: { circleId_userId: { circleId: circle.id, userId: partner.id } },
    create: { circleId: circle.id, userId: partner.id, role: "MEMBER" },
    update: { status: "ACTIVE" },
  });
  await prisma.wallet.upsert({
    where: { circleId_userId: { circleId: circle.id, userId: partner.id } },
    create: { circleId: circle.id, userId: partner.id, balance: 400, totalEarned: 400 },
    update: {},
  });

  // 奖品（按标题幂等）
  let created = 0;
  for (const r of REWARDS) {
    const exists = await prisma.reward.findFirst({
      where: { circleId: circle.id, title: r.title },
    });
    if (exists) continue;
    await prisma.reward.create({
      data: {
        circleId: circle.id,
        createdBy: owner.id,
        title: r.title,
        description: r.description,
        pointsCost: r.pointsCost,
        category: r.category,
        fulfillmentType: r.fulfillmentType,
        stock: r.stock,
        limitPerUser: r.limitPerUser,
        images: [r.image],
        status: "ACTIVE",
      },
    });
    created++;
  }

  console.log(`奖品新增 ${created} 个；成员：小雨（xiaoyu@checkin.local / demo1234，400 分）`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
