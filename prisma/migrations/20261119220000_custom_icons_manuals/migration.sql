-- Phase 4c part 3: custom icons per business, and manuals linked to an icon type.
-- CreateTable
CREATE TABLE "IconDocumentLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "iconKey" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IconDocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomIcon" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "words" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outline" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fileId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CustomIcon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IconDocumentLink_documentId_idx" ON "IconDocumentLink"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "IconDocumentLink_companyId_iconKey_documentId_key" ON "IconDocumentLink"("companyId", "iconKey", "documentId");

-- CreateIndex
CREATE INDEX "CustomIcon_companyId_deletedAt_idx" ON "CustomIcon"("companyId", "deletedAt");

