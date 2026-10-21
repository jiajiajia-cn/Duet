// 生成"像用过一阵子"的演示数据：3 周打卡 + 计时记录 + 积分流水
// 用法：node scripts/seed-history.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TZ = "Asia/Shanghai";

function localDate(offsetDays = 0, at = new Date()) {
  const d = new Date(at.getTime() + offsetDays * 86400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** 稳定伪随机，保证每次跑出来的图形一致 */
let seed = 42;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "demo@checkin.local" } });
  if (!user) throw new Error("先跑 node scripts/seed.mjs");

  const member = await prisma.circleMember.findFirst({ where: { userId: user.id } });
  const circleId = member.circleId;

  // 清空旧数据
  await prisma.checkin.deleteMany({ where: { userId: user.id } });
  await prisma.pointTxn.deleteMany({ where: { wallet: { userId: user.id } } });
  await prisma.habitStat.deleteMany({ where: { userId: user.id } });
  await prisma.timerSession.deleteMany({ where: { userId: user.id } });

  const wallet = await prisma.wallet.update({
    where: { circleId_userId: { circleId, userId: user.id } },
    data: { balance: 0, totalEarned: 0, totalSpent: 0 },
  });

  const habits = await prisma.habit.findMany({
    where: { circleId, ownerId: user.id },
    orderBy: { sortOrder: "asc" },
  });
  const skills = await prisma.skill.findMany({ where: { circleId, ownerId: user.id } });

  let balance = 0;
  const txns = [];

  const earn = async (delta, type, refType, refId, reason, when) => {
    const before = balance;
    balance += delta;
    txns.push({
      walletId: wallet.id,
      type,
      delta,
      balanceBefore: before,
      balanceAfter: balance,
      refType,
      refId,
      reason,
      createdAt: when,
    });
  };

  // ---- 3 周打卡 ----
  for (let day = 20; day >= 0; day--) {
    const date = localDate(-day);
    const when = new Date(Date.now() - day * 86400_000 + 9 * 3600_000);

    for (const h of habits) {
      // 今天留几个没打卡，看起来更像"今天还没做完"
      if (day === 0 && ["早起", "不喝奶茶"].includes(h.title)) continue;
      if (day === 0 && h.title === "阅读 30 分钟") continue;
      if (rnd() > 0.82) continue;

      const qty = h.type === "QUANTITY" ? 1 + Math.floor(rnd() * 3) : 1;
      const points =
        h.type === "QUANTITY"
          ? h.pointsPerUnit * qty
          : h.type === "TIMED"
            ? 0
            : h.pointsPerCheckin;

      const checkin = await prisma.checkin.create({
        data: {
          habitId: h.id,
          userId: user.id,
          localDate: date,
          seq: 1,
          quantity: qty,
          status: "APPROVED",
          source: "MANUAL",
          pointsAwarded: points,
          checkedAt: when,
        },
      });

      if (points > 0) {
        await earn(points, "EARN_CHECKIN", "checkin", checkin.id, h.title, when);
      }
    }
  }

  // ---- 计时记录 ----
  const plan = [
    { skill: "吉他", habit: "练琴 45 分钟", emoji: "🎸", minutes: [25, 45, 45, 60, 90] },
    { skill: "阅读", habit: "阅读 30 分钟", emoji: "📖", minutes: [20, 25, 30, 45] },
  ];

  for (const p of plan) {
    const skill = skills.find((s) => s.name === p.skill);
    const habit = habits.find((h) => h.title === p.habit);
    if (!skill) continue;

    for (let i = 0; i < 14; i++) {
      const day = 20 - i * 1.4;
      if (day < 0) break;
      const minutes = p.minutes[Math.floor(rnd() * p.minutes.length)];
      const startedAt = new Date(Date.now() - Math.round(day) * 86400_000 - 8 * 3600_000);

      // 阶梯计分：25/45/90 分钟
      const points = minutes >= 90 ? 45 : minutes >= 45 ? 20 : minutes >= 25 ? 10 : 0;

      const session = await prisma.timerSession.create({
        data: {
          userId: user.id,
          circleId,
          mode: "COUNTDOWN",
          status: "COMPLETED",
          plannedSeconds: minutes * 60,
          elapsedSeconds: minutes * 60,
          startedAt,
          endedAt: new Date(startedAt.getTime() + minutes * 60_000),
          skillId: skill.id,
          habitId: habit?.id ?? null,
          pointsAwarded: points,
          note: p.skill,
          verified: true,
        },
      });

      if (points > 0) {
        await earn(points, "EARN_TIMER", "timer", session.id, `${p.skill} ${minutes} 分钟`, startedAt);
      }
    }
  }

  // ---- 连续天数 ----
  for (const h of habits) {
    const dates = await prisma.checkin.findMany({
      where: { habitId: h.id, userId: user.id },
      select: { localDate: true },
      orderBy: { localDate: "desc" },
    });
    const set = new Set(dates.map((d) => d.localDate));
    let streak = 0;
    let cursor = localDate(0);
    // 今天没做就从昨天开始算（今天还没过完）
    if (!set.has(cursor)) cursor = localDate(-1);
    while (set.has(cursor)) {
      streak++;
      cursor = localDate(-streak - (set.has(localDate(0)) ? 0 : 1));
    }
    await prisma.habitStat.create({
      data: {
        habitId: h.id,
        userId: user.id,
        currentStreak: streak,
        bestStreak: Math.max(streak, Math.floor(3 + rnd() * 6)),
        lastDoneDate: dates[0]?.localDate ?? null,
        totalDone: dates.length,
      },
    });
  }

  // ---- 技能累计 ----
  for (const s of skills) {
    const agg = await prisma.timerSession.aggregate({
      where: { skillId: s.id },
      _sum: { elapsedSeconds: true },
    });
    await prisma.skill.update({
      where: { id: s.id },
      data: { totalSeconds: agg._sum.elapsedSeconds ?? 0 },
    });
  }

  // ---- 写流水 & 余额 ----
  for (const t of txns) {
    await prisma.pointTxn.create({ data: t });
  }
  await prisma.wallet.update({
    where: { id: wallet.id },
    data: { balance, totalEarned: balance },
  });

  const stats = {
    打卡: await prisma.checkin.count({ where: { userId: user.id } }),
    计时: await prisma.timerSession.count({ where: { userId: user.id } }),
    余额: balance,
  };
  console.log("已生成演示数据：", stats);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
