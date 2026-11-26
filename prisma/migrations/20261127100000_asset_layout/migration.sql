-- CreateEnum
CREATE TYPE "AssetDocumentKind" AS ENUM ('MANUAL', 'WARRANTY', 'LINK', 'RECEIPT', 'CERTIFICATE', 'PHOTO', 'OTHER');

-- AlterTable
ALTER TABLE "AssetCategory" ADD COLUMN     "icon" TEXT;

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "brandId" TEXT,
ADD COLUMN     "docSetId" TEXT,
ADD COLUMN     "partsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "productUrl" TEXT,
ADD COLUMN     "purchasePrice" DECIMAL(12,2),
ADD COLUMN     "replacementValue" DECIMAL(12,2),
ADD COLUMN     "supplier" TEXT,
ADD COLUMN     "warrantyEndsOn" DATE;

-- AlterTable
ALTER TABLE "MaterialBrand" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "supportEmail" TEXT,
ADD COLUMN     "supportPhone" TEXT,
ADD COLUMN     "supportUrl" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "AssetPart" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "serial" TEXT,
    "warrantyEndsOn" DATE,
    "photoFileId" TEXT,
    "notes" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AssetPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "partId" TEXT,
    "kind" "AssetDocumentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "fileId" TEXT,
    "url" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AssetDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetPart_assetId_idx" ON "AssetPart"("assetId");

-- CreateIndex
CREATE INDEX "AssetDocument_assetId_idx" ON "AssetDocument"("assetId");

-- CreateIndex
CREATE INDEX "AssetDocument_partId_idx" ON "AssetDocument"("partId");

-- CreateIndex
CREATE INDEX "Asset_docSetId_idx" ON "Asset"("docSetId");

-- AddForeignKey
ALTER TABLE "AssetPart" ADD CONSTRAINT "AssetPart_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDocument" ADD CONSTRAINT "AssetDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDocument" ADD CONSTRAINT "AssetDocument_partId_fkey" FOREIGN KEY ("partId") REFERENCES "AssetPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

