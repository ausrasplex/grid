-- CreateEnum
CREATE TYPE "PlanVersionStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "PlanSheet" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "discipline" TEXT NOT NULL DEFAULT '',
    "buildingId" TEXT,
    "levelId" TEXT,
    "currentVersionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "PlanSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanVersion" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "revision" TEXT NOT NULL DEFAULT '',
    "fileId" TEXT NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 1,
    "status" "PlanVersionStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "dpi" INTEGER,
    "pageWidthPt" DOUBLE PRECISION,
    "pageHeightPt" DOUBLE PRECISION,
    "note" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanSheet_projectId_deletedAt_idx" ON "PlanSheet"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "PlanSheet_companyId_deletedAt_idx" ON "PlanSheet"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "PlanVersion_sheetId_createdAt_idx" ON "PlanVersion"("sheetId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanVersion_fileId_idx" ON "PlanVersion"("fileId");

-- AddForeignKey
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "PlanSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
