-- CreateTable
CREATE TABLE "InsightSeen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicKey" TEXT NOT NULL,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightSeen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightSeen_userId_shownAt_idx" ON "InsightSeen"("userId", "shownAt");

-- CreateIndex
CREATE UNIQUE INDEX "InsightSeen_userId_topicKey_key" ON "InsightSeen"("userId", "topicKey");

-- AddForeignKey
ALTER TABLE "InsightSeen" ADD CONSTRAINT "InsightSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
