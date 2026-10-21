-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "HabitType" AS ENUM ('CHECK', 'QUANTITY', 'NEGATIVE', 'TIMED');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('AT_LEAST', 'AT_MOST');

-- CreateEnum
CREATE TYPE "ProofRequired" AS ENUM ('NONE', 'NOTE', 'IMAGE');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'CIRCLE');

-- CreateEnum
CREATE TYPE "HabitStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CheckinStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CheckinSource" AS ENUM ('MANUAL', 'TIMER', 'BACKFILL', 'ADMIN');

-- CreateEnum
CREATE TYPE "TxnType" AS ENUM ('EARN_CHECKIN', 'EARN_TIMER', 'EARN_BONUS', 'EARN_MANUAL', 'SPEND_REDEEM', 'REFUND', 'ADJUST', 'EXPIRE');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'SOLD_OUT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('VIRTUAL', 'PHYSICAL', 'OFFLINE');

-- CreateEnum
CREATE TYPE "RedemptionType" AS ENUM ('SINGLE', 'GROUP');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('OPEN', 'APPROVED', 'FULFILLED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'EXPIRED', 'REJECTED', 'PENDING_APPROVAL');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('PLEDGED', 'RELEASED');

-- CreateEnum
CREATE TYPE "TimerMode" AS ENUM ('STOPWATCH', 'COUNTDOWN', 'POMODORO');

-- CreateEnum
CREATE TYPE "TimerStatus" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "Strictness" AS ENUM ('LOOSE', 'STANDARD', 'STRICT');

-- CreateEnum
CREATE TYPE "SkillStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CreditMode" AS ENUM ('TIER', 'PER_MINUTE', 'PER_SESSION');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EntryKind" AS ENUM ('EVENT', 'TASK');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('PLANNED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('HABIT_REMIND', 'MISSED', 'NUDGE', 'CHECKIN_REVIEW', 'REDEEM_UPDATE', 'REDEEM_INVITE', 'TIMER_END', 'MILESTONE', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nickname" VARCHAR(20) NOT NULL,
    "avatarUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "dayStartHour" INTEGER NOT NULL DEFAULT 0,
    "weekStart" INTEGER NOT NULL DEFAULT 1,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Circle" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "avatarUrl" TEXT,
    "inviteCode" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Circle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircleMember" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "CircleMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supervision" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "habitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supervision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Habit" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" VARCHAR(40) NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '✅',
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "type" "HabitType" NOT NULL DEFAULT 'CHECK',
    "goalType" "GoalType" NOT NULL DEFAULT 'AT_LEAST',
    "frequency" JSONB NOT NULL,
    "unit" VARCHAR(8),
    "targetPerPeriod" INTEGER NOT NULL DEFAULT 1,
    "countPerDay" INTEGER NOT NULL DEFAULT 1,
    "pointsPerCheckin" INTEGER NOT NULL DEFAULT 0,
    "pointsPerUnit" INTEGER NOT NULL DEFAULT 0,
    "dailyCap" INTEGER,
    "proofRequired" "ProofRequired" NOT NULL DEFAULT 'NONE',
    "checkinWindow" JSONB,
    "allowBackfillDays" INTEGER NOT NULL DEFAULT 0,
    "backfillPointsRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "autoCheckinOnTimer" BOOLEAN NOT NULL DEFAULT false,
    "minTimerMinutes" INTEGER NOT NULL DEFAULT 0,
    "defaultSkillId" TEXT,
    "linkedHabitId" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'CIRCLE',
    "status" "HabitStatus" NOT NULL DEFAULT 'ACTIVE',
    "countInStats" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "collaborative" BOOLEAN NOT NULL DEFAULT false,
    "remindAt" VARCHAR(5),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitStat" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastDoneDate" TEXT,
    "totalDone" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkin" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localDate" VARCHAR(10) NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seq" INTEGER NOT NULL DEFAULT 1,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "images" JSONB NOT NULL DEFAULT '[]',
    "mood" VARCHAR(4),
    "status" "CheckinStatus" NOT NULL DEFAULT 'APPROVED',
    "source" "CheckinSource" NOT NULL DEFAULT 'MANUAL',
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "txnId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "totalEarned" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointTxn" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "TxnType" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "refType" VARCHAR(20),
    "refId" TEXT,
    "reason" TEXT,
    "operatorId" TEXT,
    "idempotencyKey" TEXT,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointTxn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "title" VARCHAR(40) NOT NULL,
    "description" TEXT,
    "images" JSONB NOT NULL DEFAULT '[]',
    "pointsCost" INTEGER NOT NULL,
    "stock" INTEGER,
    "limitPerUser" INTEGER NOT NULL DEFAULT 1,
    "limitPerPeriod" INTEGER,
    "cooldownDays" INTEGER NOT NULL DEFAULT 0,
    "needApproval" BOOLEAN NOT NULL DEFAULT false,
    "fulfillmentType" "FulfillmentType" NOT NULL DEFAULT 'OFFLINE',
    "category" VARCHAR(16) NOT NULL DEFAULT '奖励',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "visibility" "Visibility" NOT NULL DEFAULT 'CIRCLE',
    "status" "RewardStatus" NOT NULL DEFAULT 'DRAFT',
    "sortWeight" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redemption" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "type" "RedemptionType" NOT NULL DEFAULT 'SINGLE',
    "status" "RedemptionStatus" NOT NULL DEFAULT 'APPROVED',
    "initiatorId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "raisedPoints" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,
    "fulfillmentInfo" JSONB NOT NULL DEFAULT '{}',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fulfilledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedemptionParticipant" (
    "id" TEXT NOT NULL,
    "redemptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'PLEDGED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "txnId" TEXT,

    CONSTRAINT "RedemptionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardQuota" (
    "id" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL DEFAULT 'all',
    "usedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RewardQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimerSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "mode" "TimerMode" NOT NULL DEFAULT 'COUNTDOWN',
    "status" "TimerStatus" NOT NULL DEFAULT 'RUNNING',
    "plannedSeconds" INTEGER,
    "elapsedSeconds" INTEGER NOT NULL DEFAULT 0,
    "pausedTotalSeconds" INTEGER NOT NULL DEFAULT 0,
    "overtimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "breakSeconds" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "skillId" TEXT,
    "habitId" TEXT,
    "roomId" TEXT,
    "strictness" "Strictness" NOT NULL DEFAULT 'STANDARD',
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "deviceId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TimerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '🎯',
    "color" TEXT NOT NULL DEFAULT '#10b981',
    "description" TEXT,
    "targetHours" INTEGER,
    "levels" JSONB NOT NULL DEFAULT '[]',
    "totalSeconds" INTEGER NOT NULL DEFAULT 0,
    "status" "SkillStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditRule" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'CIRCLE',
    "skillId" TEXT,
    "mode" "CreditMode" NOT NULL DEFAULT 'TIER',
    "tiers" JSONB NOT NULL DEFAULT '[]',
    "minutesPerUnit" INTEGER NOT NULL DEFAULT 10,
    "pointsPerUnit" INTEGER NOT NULL DEFAULT 1,
    "pointsPerSession" INTEGER NOT NULL DEFAULT 10,
    "minMinutes" INTEGER NOT NULL DEFAULT 1,
    "capPerSession" INTEGER,
    "capPerDay" INTEGER,

    CONSTRAINT "CreditRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "hostId" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "status" "RoomStatus" NOT NULL DEFAULT 'OPEN',
    "startedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMember" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'READY',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "kind" "EntryKind" NOT NULL DEFAULT 'EVENT',
    "title" VARCHAR(60) NOT NULL,
    "note" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "rrule" TEXT,
    "exdates" JSONB NOT NULL DEFAULT '[]',
    "recurrenceId" TEXT,
    "reminders" JSONB NOT NULL DEFAULT '[0]',
    "category" VARCHAR(16) NOT NULL DEFAULT '默认',
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "linkedHabitId" TEXT,
    "linkedSkillId" TEXT,
    "estimateMin" INTEGER,
    "actualMin" INTEGER NOT NULL DEFAULT 0,
    "status" "EntryStatus" NOT NULL DEFAULT 'PLANNED',
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(60) NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" VARCHAR(40) NOT NULL,
    "targetType" VARCHAR(20),
    "targetId" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Circle_inviteCode_key" ON "Circle"("inviteCode");

-- CreateIndex
CREATE INDEX "CircleMember_userId_idx" ON "CircleMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CircleMember_circleId_userId_key" ON "CircleMember"("circleId", "userId");

-- CreateIndex
CREATE INDEX "Supervision_circleId_idx" ON "Supervision"("circleId");

-- CreateIndex
CREATE UNIQUE INDEX "Supervision_supervisorId_memberId_habitId_key" ON "Supervision"("supervisorId", "memberId", "habitId");

-- CreateIndex
CREATE INDEX "Habit_circleId_status_idx" ON "Habit"("circleId", "status");

-- CreateIndex
CREATE INDEX "Habit_ownerId_idx" ON "Habit"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "HabitStat_habitId_userId_key" ON "HabitStat"("habitId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Checkin_idempotencyKey_key" ON "Checkin"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Checkin_userId_localDate_idx" ON "Checkin"("userId", "localDate");

-- CreateIndex
CREATE INDEX "Checkin_habitId_localDate_idx" ON "Checkin"("habitId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "Checkin_habitId_userId_localDate_seq_key" ON "Checkin"("habitId", "userId", "localDate", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_circleId_userId_key" ON "Wallet"("circleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PointTxn_idempotencyKey_key" ON "PointTxn"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PointTxn_walletId_createdAt_idx" ON "PointTxn"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "PointTxn_refType_refId_idx" ON "PointTxn"("refType", "refId");

-- CreateIndex
CREATE INDEX "Reward_circleId_status_idx" ON "Reward"("circleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_idempotencyKey_key" ON "Redemption"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Redemption_circleId_status_idx" ON "Redemption"("circleId", "status");

-- CreateIndex
CREATE INDEX "Redemption_initiatorId_idx" ON "Redemption"("initiatorId");

-- CreateIndex
CREATE INDEX "RedemptionParticipant_userId_idx" ON "RedemptionParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RedemptionParticipant_redemptionId_userId_key" ON "RedemptionParticipant"("redemptionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardQuota_rewardId_userId_periodKey_key" ON "RewardQuota"("rewardId", "userId", "periodKey");

-- CreateIndex
CREATE INDEX "TimerSession_userId_status_idx" ON "TimerSession"("userId", "status");

-- CreateIndex
CREATE INDEX "TimerSession_skillId_startedAt_idx" ON "TimerSession"("skillId", "startedAt");

-- CreateIndex
CREATE INDEX "TimerSession_circleId_startedAt_idx" ON "TimerSession"("circleId", "startedAt");

-- CreateIndex
CREATE INDEX "Skill_circleId_status_idx" ON "Skill"("circleId", "status");

-- CreateIndex
CREATE INDEX "CreditRule_circleId_idx" ON "CreditRule"("circleId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_roomId_userId_key" ON "RoomMember"("roomId", "userId");

-- CreateIndex
CREATE INDEX "Entry_userId_startAt_idx" ON "Entry"("userId", "startAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AuditLog_circleId_createdAt_idx" ON "AuditLog"("circleId", "createdAt");

-- AddForeignKey
ALTER TABLE "CircleMember" ADD CONSTRAINT "CircleMember_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleMember" ADD CONSTRAINT "CircleMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supervision" ADD CONSTRAINT "Supervision_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supervision" ADD CONSTRAINT "Supervision_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supervision" ADD CONSTRAINT "Supervision_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitStat" ADD CONSTRAINT "HabitStat_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointTxn" ADD CONSTRAINT "PointTxn_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionParticipant" ADD CONSTRAINT "RedemptionParticipant_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "Redemption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionParticipant" ADD CONSTRAINT "RedemptionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimerSession" ADD CONSTRAINT "TimerSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimerSession" ADD CONSTRAINT "TimerSession_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimerSession" ADD CONSTRAINT "TimerSession_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimerSession" ADD CONSTRAINT "TimerSession_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditRule" ADD CONSTRAINT "CreditRule_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditRule" ADD CONSTRAINT "CreditRule_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
