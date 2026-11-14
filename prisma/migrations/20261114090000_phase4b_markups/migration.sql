-- CreateEnum
CREATE TYPE "MarkupKind" AS ENUM ('PEN', 'HIGHLIGHT', 'TEXT', 'LINE', 'ARROW', 'RECT', 'ELLIPSE', 'CLOUD', 'LENGTH', 'AREA');

-- CreateEnum
CREATE TYPE "MarkupVisibility" AS ENUM ('JUST_ME', 'COMPANY', 'SHARED');

-- CreateEnum
CREATE TYPE "PlanScaleMethod" AS ENUM ('RATIO', 'POINTS');

-- AlterTable
ALTER TABLE "JobPhoto" ADD COLUMN     "planSheetId" TEXT,
ADD COLUMN     "planX" DOUBLE PRECISION,
ADD COLUMN     "planY" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "PlanMarkup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "kind" "MarkupKind" NOT NULL,
    "points" JSONB NOT NULL,
    "color" TEXT NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "text" TEXT,
    "visibility" "MarkupVisibility" NOT NULL DEFAULT 'COMPANY',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "PlanMarkup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanScale" (
    "versionId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "metresPerUnit" DOUBLE PRECISION NOT NULL,
    "method" "PlanScaleMethod" NOT NULL,
    "ratio" INTEGER,
    "points" JSONB,
    "knownMetres" DOUBLE PRECISION,
    "setById" TEXT NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanScale_pkey" PRIMARY KEY ("versionId")
);

-- CreateIndex
CREATE INDEX "PlanMarkup_sheetId_deletedAt_idx" ON "PlanMarkup"("sheetId", "deletedAt");

-- CreateIndex
CREATE INDEX "PlanMarkup_companyId_projectId_idx" ON "PlanMarkup"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "PlanScale_sheetId_idx" ON "PlanScale"("sheetId");

-- CreateIndex
CREATE INDEX "JobPhoto_planSheetId_idx" ON "JobPhoto"("planSheetId");

-- Turn Markups on for every business that already has Plans on (new
-- businesses get it from their starting preset).
INSERT INTO "CompanyBlock" ("companyId", "blockId", "enabled", "updatedAt")
SELECT "companyId", 'markups', true, CURRENT_TIMESTAMP FROM "CompanyBlock"
WHERE "blockId" = 'plans' AND "enabled" = true
ON CONFLICT ("companyId", "blockId") DO NOTHING;
