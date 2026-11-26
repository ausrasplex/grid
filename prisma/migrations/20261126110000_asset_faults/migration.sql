-- CreateEnum
CREATE TYPE "AssetFaultType" AS ENUM ('FAULTY', 'DAMAGED', 'MISSING_PARTS', 'FAILED_TEST', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetFaultStatus" AS ENUM ('REPORTED', 'ACKNOWLEDGED', 'IN_REPAIR', 'FIXED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AssetLossKind" AS ENUM ('LOST', 'STOLEN');

-- CreateTable
CREATE TABLE "AssetFault" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "AssetFaultType" NOT NULL,
    "doNotUse" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "photoFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "AssetFaultStatus" NOT NULL DEFAULT 'REPORTED',
    "reportedById" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT,
    "siteId" TEXT,
    "buildingId" TEXT,
    "levelId" TEXT,
    "placeName" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetFault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetFaultEvent" (
    "id" TEXT NOT NULL,
    "faultId" TEXT NOT NULL,
    "status" "AssetFaultStatus",
    "note" TEXT,
    "photoFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "doNotUse" BOOLEAN NOT NULL DEFAULT false,
    "byUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetFaultEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetLoss" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" "AssetLossKind" NOT NULL,
    "lastKnown" TEXT,
    "note" TEXT,
    "policeReport" TEXT,
    "reportedById" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveredAt" TIMESTAMP(3),
    "recoveredById" TEXT,
    "retiredAt" TIMESTAMP(3),
    "retiredById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetLoss_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetFault_assetId_closedAt_idx" ON "AssetFault"("assetId", "closedAt");

-- CreateIndex
CREATE INDEX "AssetFault_companyId_closedAt_idx" ON "AssetFault"("companyId", "closedAt");

-- CreateIndex
CREATE INDEX "AssetFaultEvent_faultId_at_idx" ON "AssetFaultEvent"("faultId", "at");

-- CreateIndex
CREATE INDEX "AssetLoss_assetId_idx" ON "AssetLoss"("assetId");

-- CreateIndex
CREATE INDEX "AssetLoss_companyId_recoveredAt_retiredAt_idx" ON "AssetLoss"("companyId", "recoveredAt", "retiredAt");

-- AddForeignKey
ALTER TABLE "AssetFault" ADD CONSTRAINT "AssetFault_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetFaultEvent" ADD CONSTRAINT "AssetFaultEvent_faultId_fkey" FOREIGN KEY ("faultId") REFERENCES "AssetFault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetLoss" ADD CONSTRAINT "AssetLoss_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

