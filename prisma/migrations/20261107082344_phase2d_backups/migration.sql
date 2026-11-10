-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "triggeredById" TEXT,
    "includesDb" BOOLEAN NOT NULL,
    "includesMedia" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "folder" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "dbBytes" BIGINT NOT NULL DEFAULT 0,
    "mediaBytes" BIGINT NOT NULL DEFAULT 0,
    "mediaFiles" INTEGER NOT NULL DEFAULT 0,
    "newMediaBytes" BIGINT NOT NULL DEFAULT 0,
    "error" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupRun_status_deletedAt_startedAt_idx" ON "BackupRun"("status", "deletedAt", "startedAt");
