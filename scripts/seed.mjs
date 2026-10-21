// 创建一个演示账号：demo@checkin.local / demo1234
// 用法：node scripts/seed.mjs
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function hash(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const EMAIL = "demo@checkin.local";
const PASSWORD = "demo1234";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log("演示账号已存在：", EMAIL);
    return;
  }

  const user = await prisma.user.create({
    data: { email: EMAIL, nickname: "小满", passwordHash: hash(PASSWORD) },
  });

  const circle = await prisma.circle.create({
    data: {
      name: "小圈子",
      ownerId: user.id,
      inviteCode: "demo66",
    },
  });

  await prisma.circleMember.create({
    data: { circleId: circle.id, userId: user.id, role: "OWNER" },
  });
  await prisma.wallet.create({
    data: { circleId: circle.id, userId: user.id, balance: 0 },
  });
  await prisma.user.update({ where: { id: user.id }, data: { activeCircleId: circle.id } });

  const habits = [
    { title: "早起", icon: "🌅", pointsPerCheckin: 10, sortOrder: 1 },
    { title: "阅读 30 分钟", icon: "📖", pointsPerCheckin: 15, sortOrder: 2 },
    {
      title: "喝水",
      icon: "💧",
      type: "QUANTITY",
      unit: "杯",
      pointsPerUnit: 5,
      countPerDay: 3,
      pointsPerCheckin: 0,
      sortOrder: 3,
    },
    { title: "练琴 45 分钟", icon: "🎸", type: "TIMED", pointsPerCheckin: 0, sortOrder: 4 },
    { title: "不喝奶茶", icon: "🚫", type: "NEGATIVE", pointsPerCheckin: 8, sortOrder: 5 },
  ];

  for (const h of habits) {
    await prisma.habit.create({
      data: { ...h, circleId: circle.id, ownerId: user.id, frequency: { kind: "daily" } },
    });
  }

  for (const s of [
    { name: "吉他", icon: "🎸", color: "#6366f1" },
    { name: "阅读", icon: "📖", color: "#10b981" },
  ]) {
    await prisma.skill.create({
      data: { ...s, circleId: circle.id, ownerId: user.id },
    });
  }

  console.log("已创建演示账号：", EMAIL, "/", PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
