-- Checklist Block: a to-do list on each job (docs/stage-2-projects.md "Job checklist").
-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "doneByName" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistItem_companyId_projectId_position_idx" ON "ChecklistItem"("companyId", "projectId", "position");

-- CreateIndex
CREATE INDEX "ChecklistItem_projectId_idx" ON "ChecklistItem"("projectId");

-- Switch it on for businesses that already exist (new ones get it from their preset).
INSERT INTO "CompanyBlock" ("companyId", "blockId", "enabled", "updatedAt")
SELECT "id", 'checklists', true, CURRENT_TIMESTAMP FROM "Company"
ON CONFLICT ("companyId", "blockId") DO NOTHING;
