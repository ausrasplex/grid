-- AlterTable
ALTER TABLE "JobNote" ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "purgedAt" TIMESTAMP(3),
ADD COLUMN     "restoredAt" TIMESTAMP(3),
ADD COLUMN     "restoredById" TEXT;

-- AlterTable
ALTER TABLE "JobPhoto" ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "purgedAt" TIMESTAMP(3),
ADD COLUMN     "restoredAt" TIMESTAMP(3),
ADD COLUMN     "restoredById" TEXT;

-- AlterTable
ALTER TABLE "StoredFile" ADD COLUMN     "purgedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ServerSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CleanupRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "triggeredById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "summary" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,

    CONSTRAINT "CleanupRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleanupItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "companyId" TEXT,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "refId" TEXT,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "applied" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CleanupItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CleanupRun_startedAt_idx" ON "CleanupRun"("startedAt");

-- CreateIndex
CREATE INDEX "CleanupItem_companyId_createdAt_idx" ON "CleanupItem"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CleanupItem_runId_idx" ON "CleanupItem"("runId");

-- CreateIndex
CREATE INDEX "StoredFile_blockId_deletedAt_createdAt_idx" ON "StoredFile"("blockId", "deletedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "CleanupItem" ADD CONSTRAINT "CleanupItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CleanupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
