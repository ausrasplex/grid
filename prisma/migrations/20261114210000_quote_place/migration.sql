-- A quote started from a floor remembers the site, building and floor, so the job it becomes goes there.
-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "buildingId" TEXT,
ADD COLUMN     "levelId" TEXT,
ADD COLUMN     "siteId" TEXT;
