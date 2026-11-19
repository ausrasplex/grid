-- Phase 5b part 4: search inside documents. Page text from pdftotext (and
-- spreadsheet cell text), searched with PostgreSQL full-text search. The
-- search column is filled by the app with to_tsvector('english', text).
-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "textAt" TIMESTAMP(3),
ADD COLUMN     "textPages" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "sheetName" TEXT,
    "text" TEXT NOT NULL,
    "search" tsvector,

    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentPage_versionId_page_idx" ON "DocumentPage"("versionId", "page");

-- CreateIndex
CREATE INDEX "DocumentPage_companyId_idx" ON "DocumentPage"("companyId");

-- CreateIndex
CREATE INDEX "DocumentPage_search_idx" ON "DocumentPage" USING GIN ("search");

