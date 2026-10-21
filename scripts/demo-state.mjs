// 把演示数据摆回"好看且真实"的状态（跑完测试后用）
// 用法：node scripts/demo-state.mjs
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";

const prisma = new PrismaClient();

const localDate = (offset = 0, at = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at.getTime() + offset * 86400_000));

const balanceOf = async (circleId, userId) =>
  (await prisma.wallet.findUnique({ where: { circleId_userId: { circleId, userId } } })).balance;

async function charge(circleId, userId, points, refId, reason, type = "SPEND_REDEEM") {
  const w = await prisma.wallet.findUnique({ where: { circleId_userId: { circleId, userId } } });
  const updated = await prisma.wallet.update({
    where: { id: w.id },
    data: { balance: { decrement: points }, totalSpent: { increment: points } },
  });
  await prisma.pointTxn.create({
    data: {
      walletId: w.id,
      type,
      delta: -points,
      balanceBefore: w.balance,
      balanceAfter: updated.balance,
      refType: "redemption",
      refId,
      reason,
    },
  });
}

async function main() {
  const demo = await prisma.user.findUnique({ where: { email: "demo@checkin.local" } });
  const yu = await prisma.user.findUnique({ where: { email: "xiaoyu@checkin.local" } });
  const circle = await prisma.circle.findFirst({ where: { ownerId: demo.id } });
  await prisma.user.update({ where: { id: demo.id }, data: { activeCircleId: circle.id } });

  await prisma.redemption.deleteMany({ where: { circleId: circle.id } });

  console.log("重建 3 周打卡记录…");
  execFileSync(process.execPath, ["scripts/seed-history.mjs"], { stdio: "inherit" });

  await prisma.reward.updateMany({ where: { circleId: circle.id }, data: { status: "ACTIVE" } });  await prisma.reward.updateMany({ where: { circleId: circle.id, title: "那副一直在看的耳机" }, data: { stock: 1 } });
  await prisma.reward.updateMany({ where: { circleId: circle.id, title: "一场电影" }, data: { stock: 1 } });
  await prisma.reward.updateMany({ where: { circleId: circle.id, title: "挑一本书" }, data: { status: "ACTIVE" } });

  const rewards = await prisma.reward.findMany({ where: { circleId: circle.id } });
  const milktea = rewards.find((r) => r.title === "周末一杯奶茶");
  const headphone = rewards.find((r) => r.title === "那副一直在看的耳机");

  // 计时计分规则（示例值，用户能在 /settings/credit 改）
  const ruleData = {
    mode: "TIER",
    tiers: [
      { minutes: 25, points: 10 },
      { minutes: 45, points: 20 },
      { minutes: 90, points: 45 },
    ],
    minutesPerUnit: 10,
    pointsPerUnit: 1,
    pointsPerSession: 10,
    minMinutes: 5,
    capPerSession: null,
    capPerDay: null,
  };
  const rule = await prisma.creditRule.findFirst({ where: { circleId: circle.id, scope: "CIRCLE" } });
  if (rule) {
    await prisma.creditRule.update({ where: { id: rule.id }, data: ruleData });
  } else {
    await prisma.creditRule.create({ data: { ...ruleData, circleId: circle.id, scope: "CIRCLE" } });
  }

  // 一起打卡：两个人都完成才算成功
  let duo = await prisma.habit.findFirst({ where: { circleId: circle.id, title: "一起散步 20 分钟" } });
  if (!duo) {
    duo = await prisma.habit.create({
      data: {
        circleId: circle.id,
        ownerId: demo.id,
        title: "一起散步 20 分钟",
        icon: "🐶",
        type: "CHECK",
        frequency: { kind: "daily" },
        pointsPerCheckin: 15,
        collaborative: true,
        sortOrder: 0,
      },
    });
  } else {
    await prisma.habit.update({ where: { id: duo.id }, data: { collaborative: true, status: "ACTIVE", sortOrder: 0 } });
  }
  await prisma.checkin.deleteMany({ where: { habitId: duo.id } });
  await prisma.habitStat.deleteMany({ where: { habitId: duo.id } });

  // 日程：今天一件、明天一件、每周一件
  await prisma.entry.deleteMany({ where: { userId: demo.id } });
  const d0 = localDate(0);
  const d1 = localDate(1);
  await prisma.entry.createMany({
    data: [
      {
        userId: demo.id,
        circleId: circle.id,
        kind: "EVENT",
        title: "晚上练琴 1 小时",
        startAt: new Date(`${d0}T19:30:00+08:00`),
        endAt: new Date(`${d0}T20:30:00+08:00`),
        category: "练习",
        color: "#6366f1",
        estimateMin: 60,
        reminders: [10],
      },
      {
        userId: demo.id,
        circleId: circle.id,
        kind: "EVENT",
        title: "晨跑 5 公里",
        startAt: new Date(`${d1}T07:00:00+08:00`),
        endAt: new Date(`${d1}T07:40:00+08:00`),
        category: "运动",
        color: "#10b981",
        rrule: JSON.stringify({ kind: "weekly", days: [1, 3, 5] }),
      },
    ],
  });

  // 自习室：开一间等着的
  await prisma.room.deleteMany({ where: { circleId: circle.id, name: "睡前安静 30 分钟" } });
  const room = await prisma.room.create({
    data: {
      circleId: circle.id,
      name: "睡前安静 30 分钟",
      code: "quiet8",
      hostId: demo.id,
      settings: { durationMinutes: 30 },
    },
  });
  await prisma.roomMember.createMany({
    data: [
      { roomId: room.id, userId: demo.id, state: "READY" },
      { roomId: room.id, userId: yu.id, state: "READY" },
    ],
  });
  await prisma.habit.updateMany({
    where: { circleId: circle.id, type: "TIMED" },
    data: { autoCheckinOnTimer: true, minTimerMinutes: 45, pointsPerCheckin: 20 },
  });

  // 小满自己的习惯不需要确认；小雨有一个"需要确认"的习惯，并留一条待确认，方便看监督打卡
  await prisma.habit.updateMany({ where: { circleId: circle.id, ownerId: demo.id }, data: { needsReview: false } });

  const yuHabitTitle = "早起";
  let yuHabit = await prisma.habit.findFirst({
    where: { circleId: circle.id, ownerId: yu.id, title: yuHabitTitle },
  });
  if (!yuHabit) {
    yuHabit = await prisma.habit.create({
      data: {
        circleId: circle.id,
        ownerId: yu.id,
        title: yuHabitTitle,
        icon: "🌅",
        type: "CHECK",
        frequency: { kind: "daily" },
        pointsPerCheckin: 10,
        needsReview: true,
        sortOrder: 1,
      },
    });
  } else {
    await prisma.habit.update({ where: { id: yuHabit.id }, data: { needsReview: true } });
  }

  await prisma.checkin.deleteMany({ where: { userId: yu.id } });
  await prisma.checkin.create({
    data: {
      habitId: yuHabit.id,
      userId: yu.id,
      localDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      seq: 1,
      quantity: 1,
      status: "PENDING",
      source: "MANUAL",
      note: "今天六点半就起来了",
    },
  });

  // 1) 小满换了一杯奶茶（待发放）
  const o1 = await prisma.redemption.create({
    data: {
      circleId: circle.id,
      rewardId: milktea.id,
      type: "SINGLE",
      status: "APPROVED",
      initiatorId: demo.id,
      recipientId: demo.id,
      snapshot: {
        title: milktea.title,
        pointsCost: milktea.pointsCost,
        images: milktea.images,
        description: milktea.description,
        fulfillmentType: milktea.fulfillmentType,
      },
      pointsCost: milktea.pointsCost,
      raisedPoints: milktea.pointsCost,
    },
  });
  await prisma.redemptionParticipant.create({
    data: { redemptionId: o1.id, userId: demo.id, points: milktea.pointsCost },
  });
  await charge(circle.id, demo.id, milktea.pointsCost, o1.id, milktea.title);

  // 2) 小雨发起耳机合兑，出了 900，等小满补 900
  await prisma.wallet.update({
    where: { circleId_userId: { circleId: circle.id, userId: yu.id } },
    data: { balance: 900 },
  });
  await prisma.reward.update({ where: { id: headphone.id }, data: { stock: 0 } });

  const g = await prisma.redemption.create({
    data: {
      circleId: circle.id,
      rewardId: headphone.id,
      type: "GROUP",
      status: "OPEN",
      initiatorId: yu.id,
      recipientId: yu.id,
      snapshot: {
        title: headphone.title,
        pointsCost: headphone.pointsCost,
        images: headphone.images,
        description: headphone.description,
        fulfillmentType: headphone.fulfillmentType,
      },
      pointsCost: headphone.pointsCost,
      raisedPoints: 900,
      expiresAt: new Date(Date.now() + 20 * 3600_000),
    },
  });
  await prisma.redemptionParticipant.create({
    data: { redemptionId: g.id, userId: yu.id, points: 900 },
  });
  await charge(circle.id, yu.id, 900, g.id, `${headphone.title}（合兑）`);

  console.log(
    "演示状态就绪：小满",
    await balanceOf(circle.id, demo.id),
    "分 / 小雨",
    await balanceOf(circle.id, yu.id),
    "分 / 合兑进度 900/1800",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
