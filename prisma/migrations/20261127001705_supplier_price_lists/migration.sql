-- CreateTable
CREATE TABLE "SupplierPriceList" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "sellPrices" TEXT NOT NULL DEFAULT 'KEEP_MARKUP',
    "newItemMarkup" DECIMAL(7,2),
    "lastImportedAt" TIMESTAMP(3),
    "lastFileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierPriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "priceItemId" TEXT NOT NULL,
    "costBefore" DECIMAL(12,2),
    "costAfter" DECIMAL(12,2),
    "sellBefore" DECIMAL(12,2),
    "sellAfter" DECIMAL(12,2),
    "source" TEXT NOT NULL,
    "supplier" TEXT,
    "fileName" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierPriceList_companyId_idx" ON "SupplierPriceList"("companyId");

-- CreateIndex
CREATE INDEX "PriceChange_priceItemId_changedAt_idx" ON "PriceChange"("priceItemId", "changedAt");

-- CreateIndex
CREATE INDEX "PriceChange_companyId_changedAt_idx" ON "PriceChange"("companyId", "changedAt");

-- CreateIndex
CREATE INDEX "PriceItem_companyId_supplierCode_idx" ON "PriceItem"("companyId", "supplierCode");
