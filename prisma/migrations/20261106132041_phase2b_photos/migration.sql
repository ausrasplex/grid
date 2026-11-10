-- CreateEnum
CREATE TYPE "PhotoTag" AS ENUM ('NONE', 'BEFORE', 'AFTER');

-- CreateEnum
CREATE TYPE "ItemVisibility" AS ENUM ('PRIVATE', 'SHARED');

-- CreateTable
CREATE TABLE "JobPhoto" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "buildingId" TEXT,
    "levelId" TEXT,
    "fileId" TEXT NOT NULL,
    "caption" TEXT,
    "tag" "PhotoTag" NOT NULL DEFAULT 'NONE',
    "visibility" "ItemVisibility" NOT NULL DEFAULT 'PRIVATE',
    "takenAt" TIMESTAMP(3) NOT NULL,
    "takenById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobNote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "buildingId" TEXT,
    "levelId" TEXT,
    "body" TEXT NOT NULL,
    "visibility" "ItemVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "blockId" TEXT,
    "key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT NOT NULL,
    "variants" JSONB NOT NULL DEFAULT '{}',
    "originalName" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attachedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobPhoto_fileId_key" ON "JobPhoto"("fileId");

-- CreateIndex
CREATE INDEX "JobPhoto_projectId_takenAt_idx" ON "JobPhoto"("projectId", "takenAt");

-- CreateIndex
CREATE INDEX "JobPhoto_projectId_buildingId_levelId_idx" ON "JobPhoto"("projectId", "buildingId", "levelId");

-- CreateIndex
CREATE INDEX "JobNote_projectId_createdAt_idx" ON "JobNote"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "StoredFile_companyId_createdAt_idx" ON "StoredFile"("companyId", "createdAt");
