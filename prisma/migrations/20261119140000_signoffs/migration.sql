-- Phase 5b part 3: row sign-offs (signoffs Block, a trial).
-- CreateTable
CREATE TABLE "SheetSignoff" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "signedOff" BOOLEAN NOT NULL,
    "note" TEXT,
    "rowText" TEXT NOT NULL DEFAULT '',
    "byId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SheetSignoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetSignoffSettings" (
    "documentId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "matchColumn" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetSignoffSettings_pkey" PRIMARY KEY ("documentId","sheetName")
);

-- CreateIndex
CREATE INDEX "SheetSignoff_documentId_sheetName_at_idx" ON "SheetSignoff"("documentId", "sheetName", "at");

-- CreateIndex
CREATE INDEX "SheetSignoff_companyId_idx" ON "SheetSignoff"("companyId");

-- CreateIndex
CREATE INDEX "SheetSignoffSettings_companyId_idx" ON "SheetSignoffSettings"("companyId");

