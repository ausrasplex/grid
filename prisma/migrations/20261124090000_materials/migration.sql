-- Materials (core, docs/materials-block.md): the business's list of the things
-- it installs. The price book's material items now point at a material, and
-- the price book's Brands list moves to Materials (same ids, nothing lost).

-- CreateTable
CREATE TABLE "MaterialBrand" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaterialBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialFamily" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaterialFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemType" TEXT,
    "brandId" TEXT,
    "familyId" TEXT,
    "model" TEXT,
    "finish" TEXT,
    "size" TEXT,
    "link" TEXT,
    "trade" TEXT NOT NULL,
    "photoFileId" TEXT,
    "swatch" TEXT,
    "notes" TEXT,
    "catalogueModelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialBrand_companyId_idx" ON "MaterialBrand"("companyId");

-- CreateIndex
CREATE INDEX "MaterialFamily_companyId_name_idx" ON "MaterialFamily"("companyId", "name");

-- CreateIndex
CREATE INDEX "Material_companyId_trade_idx" ON "Material"("companyId", "trade");

-- CreateIndex
CREATE INDEX "Material_brandId_idx" ON "Material"("brandId");

-- CreateIndex
CREATE INDEX "Material_familyId_idx" ON "Material"("familyId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "MaterialBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "MaterialFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Brands move across with their ids.
INSERT INTO "MaterialBrand" ("id", "companyId", "name", "createdAt", "updatedAt", "deletedAt")
SELECT "id", "companyId", "name", "createdAt", "updatedAt", "deletedAt" FROM "PriceBrand";

-- AlterTable
ALTER TABLE "PriceItem" ADD COLUMN "materialId" TEXT;

-- Each material item in the price book becomes a material (same id, so it's
-- easy to follow), named as before, with its brand, in the business's own
-- trade (the same table as blocks/materials/trades.ts tradeForCompany).
-- Removed items become removed materials.
INSERT INTO "Material" ("id", "companyId", "name", "brandId", "trade", "createdAt", "updatedAt", "deletedAt")
SELECT
    item."id",
    item."companyId",
    item."name",
    brand."id",
    CASE company."tradeProfile"
        WHEN 'ELECTRICAL' THEN 'electrical'
        WHEN 'AV' THEN 'electrical'
        WHEN 'LINES' THEN 'electrical'
        WHEN 'TEST_TAG' THEN 'electrical'
        WHEN 'CONTROLS_BMS' THEN 'electrical'
        WHEN 'LIFTS' THEN 'electrical'
        WHEN 'DATA_COMMS' THEN 'data'
        WHEN 'SOLAR' THEN 'solar'
        WHEN 'SECURITY' THEN 'security'
        WHEN 'FIRE' THEN 'fire'
        WHEN 'FIRE_DETECTION' THEN 'fire'
        WHEN 'PASSIVE_FIRE' THEN 'fire'
        WHEN 'MECHANICAL' THEN 'hvac'
        WHEN 'REFRIGERATION' THEN 'hvac'
        WHEN 'DUCTWORK' THEN 'hvac'
        WHEN 'INSULATION_LAGGING' THEN 'hvac'
        WHEN 'PLUMBING' THEN 'plumbing'
        WHEN 'DRAINAGE' THEN 'plumbing'
        WHEN 'IRRIGATION' THEN 'plumbing'
        WHEN 'GASFITTING' THEN 'gas'
        ELSE 'other'
    END,
    item."createdAt",
    item."updatedAt",
    item."deletedAt"
FROM "PriceItem" item
LEFT JOIN "Company" company ON company."id" = item."companyId"
LEFT JOIN "MaterialBrand" brand ON brand."id" = item."brandId" AND brand."deletedAt" IS NULL
WHERE item."kind" = 'MATERIAL';

UPDATE "PriceItem" SET "materialId" = "id" WHERE "kind" = 'MATERIAL';

-- CreateIndex
CREATE INDEX "PriceItem_materialId_idx" ON "PriceItem"("materialId");

-- The price book's own brands are gone (they're Materials' now).
ALTER TABLE "PriceItem" DROP CONSTRAINT "PriceItem_brandId_fkey";
DROP INDEX "PriceItem_brandId_idx";
ALTER TABLE "PriceItem" DROP COLUMN "brandId";
DROP TABLE "PriceBrand";
