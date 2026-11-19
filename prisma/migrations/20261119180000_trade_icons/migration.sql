-- Phase 4c part 1: trade icons placed on plans (PlanMarkup kind ICON) and
-- their numbered versions per job (JobIconVersion).
-- AlterEnum
ALTER TYPE "MarkupKind" ADD VALUE 'ICON';

-- AlterTable
ALTER TABLE "PlanMarkup" ADD COLUMN     "iconKey" TEXT,
ADD COLUMN     "iconNumber" INTEGER;

-- CreateTable
CREATE TABLE "JobIconVersion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "iconKey" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "priceItemId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobIconVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobIconVersion_projectId_idx" ON "JobIconVersion"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "JobIconVersion_companyId_projectId_iconKey_number_key" ON "JobIconVersion"("companyId", "projectId", "iconKey", "number");

-- CreateIndex
CREATE INDEX "PlanMarkup_projectId_kind_deletedAt_idx" ON "PlanMarkup"("projectId", "kind", "deletedAt");

