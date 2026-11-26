-- CreateEnum
CREATE TYPE "AssetCheckResult" AS ENUM ('PASS', 'FAIL');

-- AlterEnum
ALTER TYPE "AssetStatus" ADD VALUE 'OVERDUE';

-- AlterTable
ALTER TABLE "AssetCategory" DROP COLUMN "inspectionIntervalDays",
DROP COLUMN "inspectionType";

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "serviceEnabled" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "nextInspectionDue" SET DATA TYPE DATE;

-- CreateTable
CREATE TABLE "AssetRoutine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT,
    "assetId" TEXT,
    "name" TEXT NOT NULL,
    "everyMonths" INTEGER,
    "mustPass" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AssetRoutine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCheck" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "routineIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "title" TEXT NOT NULL,
    "result" "AssetCheckResult" NOT NULL DEFAULT 'PASS',
    "doneBy" TEXT,
    "tagColour" TEXT,
    "cost" DECIMAL(12,2),
    "fileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "faultId" TEXT,
    "byUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AssetCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetBooking" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "routineIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "date" DATE NOT NULL,
    "withWho" TEXT,
    "byUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedHow" TEXT,

    CONSTRAINT "AssetBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetRoutine_companyId_idx" ON "AssetRoutine"("companyId");

-- CreateIndex
CREATE INDEX "AssetRoutine_categoryId_idx" ON "AssetRoutine"("categoryId");

-- CreateIndex
CREATE INDEX "AssetRoutine_assetId_idx" ON "AssetRoutine"("assetId");

-- CreateIndex
CREATE INDEX "AssetCheck_assetId_date_idx" ON "AssetCheck"("assetId", "date");

-- CreateIndex
CREATE INDEX "AssetCheck_companyId_idx" ON "AssetCheck"("companyId");

-- CreateIndex
CREATE INDEX "AssetBooking_assetId_closedAt_idx" ON "AssetBooking"("assetId", "closedAt");

-- AddForeignKey
ALTER TABLE "AssetRoutine" ADD CONSTRAINT "AssetRoutine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRoutine" ADD CONSTRAINT "AssetRoutine_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCheck" ADD CONSTRAINT "AssetCheck_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetBooking" ADD CONSTRAINT "AssetBooking_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

