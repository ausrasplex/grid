-- Plan layers: per sheet; markups and photo pins sit on one, or on Default (null).
-- AlterTable
ALTER TABLE "PlanMarkup" ADD COLUMN     "layerId" TEXT;

-- AlterTable
ALTER TABLE "JobPhoto" ADD COLUMN     "planLayerId" TEXT;

-- CreateTable
CREATE TABLE "PlanLayer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PlanLayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanLayer_sheetId_deletedAt_idx" ON "PlanLayer"("sheetId", "deletedAt");

