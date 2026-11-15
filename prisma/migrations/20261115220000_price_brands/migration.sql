-- Price book brands (Clipsal, HPM…): a list per business, picked on each item.
CREATE TABLE "PriceBrand" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PriceBrand_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceBrand_companyId_idx" ON "PriceBrand"("companyId");

ALTER TABLE "PriceItem" ADD COLUMN "brandId" TEXT;

CREATE INDEX "PriceItem_brandId_idx" ON "PriceItem"("brandId");

ALTER TABLE "PriceItem" ADD CONSTRAINT "PriceItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "PriceBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
