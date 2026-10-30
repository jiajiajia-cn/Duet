-- CreateTable
CREATE TABLE "AiReport" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(8) NOT NULL DEFAULT 'DAILY',
    "date" VARCHAR(10) NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiReport_userId_createdAt_idx" ON "AiReport"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiReport_userId_kind_date_key" ON "AiReport"("userId", "kind", "date");

-- AddForeignKey
ALTER TABLE "AiReport" ADD CONSTRAINT "AiReport_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReport" ADD CONSTRAINT "AiReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
