-- Time off for some hours on one day: from and to times (docs/scheduling-block.md "Time off").
-- AlterTable
ALTER TABLE "Leave" ADD COLUMN     "fromTime" TEXT,
ADD COLUMN     "toTime" TEXT;

