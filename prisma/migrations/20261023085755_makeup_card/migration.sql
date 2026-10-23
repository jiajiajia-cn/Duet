-- CreateTable
CREATE TABLE "MakeupCard" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "usedOn" VARCHAR(10),
    "usedAt" TIMESTAMP(3),
    "habitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MakeupCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MakeupCard_circleId_userId_usedAt_idx" ON "MakeupCard"("circleId", "userId", "usedAt");

-- CreateIndex
CREATE INDEX "MakeupCard_userId_createdAt_idx" ON "MakeupCard"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "MakeupCard" ADD CONSTRAINT "MakeupCard_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeupCard" ADD CONSTRAINT "MakeupCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
