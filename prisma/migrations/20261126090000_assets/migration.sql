-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_SERVICE', 'FAULTY', 'OUT_OF_SERVICE', 'IN_REPAIR', 'RETIRED', 'LOST');

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "inspectionIntervalDays" INTEGER,
    "inspectionType" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "serial" TEXT,
    "purchasedOn" DATE,
    "photoFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_SERVICE',
    "tagCode" TEXT NOT NULL,
    "barcode" TEXT,
    "nextInspectionDue" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "parentAssetId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetSettings" (
    "companyId" TEXT NOT NULL,
    "notSeenDays" INTEGER NOT NULL DEFAULT 30,
    "publicLookup" BOOLEAN NOT NULL DEFAULT true,
    "showLostPublicly" BOOLEAN NOT NULL DEFAULT true,
    "publicFields" TEXT NOT NULL DEFAULT 'NAME',
    "stickerLayout" TEXT NOT NULL DEFAULT 'a4-21',
    "stickerCustom" JSONB,
    "stickerOffsetX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stickerOffsetY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetSettings_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "AssetCategory_companyId_idx" ON "AssetCategory"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_tagCode_key" ON "Asset"("tagCode");

-- CreateIndex
CREATE INDEX "Asset_companyId_status_idx" ON "Asset"("companyId", "status");

-- CreateIndex
CREATE INDEX "Asset_companyId_barcode_idx" ON "Asset"("companyId", "barcode");

-- CreateIndex
CREATE INDEX "Asset_categoryId_idx" ON "Asset"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_companyId_number_key" ON "Asset"("companyId", "number");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

