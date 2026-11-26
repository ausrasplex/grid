-- AlterTable
ALTER TABLE "ChecklistItem" ADD COLUMN     "markupId" TEXT;

-- AlterTable
ALTER TABLE "JobPhoto" ADD COLUMN     "markupId" TEXT;

-- CreateIndex
CREATE INDEX "ChecklistItem_markupId_idx" ON "ChecklistItem"("markupId");

-- CreateIndex
CREATE INDEX "JobPhoto_markupId_idx" ON "JobPhoto"("markupId");
