-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PriceItemKind" AS ENUM ('LABOUR', 'MATERIAL');

-- CreateEnum
CREATE TYPE "QuoteClientView" AS ENUM ('ITEMISED', 'SECTIONS', 'LUMP');

-- CreateTable
CREATE TABLE "TaxSettings" (
    "companyId" TEXT NOT NULL,
    "taxName" TEXT NOT NULL DEFAULT 'GST',
    "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT false,
    "registrationLabel" TEXT NOT NULL DEFAULT 'ABN',
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "locale" TEXT NOT NULL DEFAULT 'en-AU',
    "rounding" TEXT NOT NULL DEFAULT 'LINE',
    "documentTitle" TEXT NOT NULL DEFAULT 'Quote',
    "defaultTaxCodeId" TEXT,
    "quotePrefix" TEXT NOT NULL DEFAULT 'Q-',
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "defaultTerms" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxSettings_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "TaxCode" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rate" DECIMAL(6,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "abn" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "PriceItemKind" NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "cost" DECIMAL(12,2),
    "sell" DECIMAL(12,2) NOT NULL,
    "taxCodeId" TEXT,
    "supplier" TEXT,
    "supplierCode" TEXT,
    "favourite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PriceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientId" TEXT,
    "siteAddress" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "clientView" "QuoteClientView" NOT NULL DEFAULT 'ITEMISED',
    "pricesIncludeTax" BOOLEAN NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "intro" TEXT,
    "terms" TEXT,
    "internalNotes" TEXT,
    "projectId" TEXT,
    "createdById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedHow" TEXT,
    "acceptedNote" TEXT,
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "currentRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "section" TEXT,
    "priceItemId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "cost" DECIMAL(12,2),
    "sell" DECIMAL(12,2) NOT NULL,
    "taxCodeId" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRevision" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "pdfFileId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT NOT NULL,
    "sentTo" TEXT,

    CONSTRAINT "QuoteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteEvent" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "byUserId" TEXT,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocTheme" (
    "companyId" TEXT NOT NULL,
    "logoFileId" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#b45309',
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "website" TEXT,
    "licenceLabel" TEXT,
    "licenceNumber" TEXT,
    "footerText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocTheme_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "TaxCode_companyId_idx" ON "TaxCode"("companyId");

-- CreateIndex
CREATE INDEX "Client_companyId_name_idx" ON "Client"("companyId", "name");

-- CreateIndex
CREATE INDEX "PriceItem_companyId_kind_idx" ON "PriceItem"("companyId", "kind");

-- CreateIndex
CREATE INDEX "Quote_companyId_status_idx" ON "Quote"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_companyId_number_key" ON "Quote"("companyId", "number");

-- CreateIndex
CREATE INDEX "QuoteLine_quoteId_sort_idx" ON "QuoteLine"("quoteId", "sort");

-- CreateIndex
CREATE INDEX "QuoteRevision_quoteId_idx" ON "QuoteRevision"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteEvent_quoteId_at_idx" ON "QuoteEvent"("quoteId", "at");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEvent" ADD CONSTRAINT "QuoteEvent_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
