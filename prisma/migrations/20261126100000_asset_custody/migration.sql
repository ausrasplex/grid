-- CreateEnum
CREATE TYPE "AssetHolder" AS ENUM ('STORE', 'PROJECT', 'USER', 'VEHICLE', 'ASSET');

-- CreateEnum
CREATE TYPE "AssetMove" AS ENUM ('CHECK_OUT', 'RETURN', 'TAKE_OVER', 'MOVE');

-- CreateTable
CREATE TABLE "AssetCustody" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "holderType" "AssetHolder" NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "siteId" TEXT,
    "buildingId" TEXT,
    "levelId" TEXT,
    "label" TEXT,
    "placeName" TEXT,
    "parentId" TEXT,
    "move" "AssetMove" NOT NULL,
    "note" TEXT,
    "fromAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toAt" TIMESTAMP(3),
    "byUserId" TEXT NOT NULL,

    CONSTRAINT "AssetCustody_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetCustody_assetId_fromAt_idx" ON "AssetCustody"("assetId", "fromAt");

-- CreateIndex
CREATE INDEX "AssetCustody_companyId_toAt_idx" ON "AssetCustody"("companyId", "toAt");

-- CreateIndex
CREATE INDEX "AssetCustody_userId_toAt_idx" ON "AssetCustody"("userId", "toAt");

-- CreateIndex
CREATE INDEX "AssetCustody_projectId_toAt_idx" ON "AssetCustody"("projectId", "toAt");

-- AddForeignKey
ALTER TABLE "AssetCustody" ADD CONSTRAINT "AssetCustody_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

