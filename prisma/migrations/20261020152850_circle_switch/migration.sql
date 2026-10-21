-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activeCircleId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeCircleId_fkey" FOREIGN KEY ("activeCircleId") REFERENCES "Circle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
