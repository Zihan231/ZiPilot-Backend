-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'REMINDER_SENT';

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wishlistJobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReminderLog_userId_sentAt_idx" ON "ReminderLog"("userId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_wishlistJobId_kind_key" ON "ReminderLog"("wishlistJobId", "kind");

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_wishlistJobId_fkey" FOREIGN KEY ("wishlistJobId") REFERENCES "WishlistJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
