-- CreateEnum
CREATE TYPE "DocumentVersionStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "DocumentLibrary" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isFinancial" BOOLEAN NOT NULL DEFAULT false,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "availableOffline" BOOLEAN NOT NULL DEFAULT false,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSettings" (
    "companyId" TEXT NOT NULL,
    "jobFolders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSettings_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "JobDocumentFolder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobDocumentFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "libraryId" TEXT,
    "projectId" TEXT,
    "folderId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "models" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productType" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentVersionId" TEXT,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "availableOffline" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "LibraryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "status" "DocumentVersionStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "pageSizes" JSONB NOT NULL DEFAULT '[]',
    "sheets" JSONB,
    "note" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "folderId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentLibrary_companyId_deletedAt_idx" ON "DocumentLibrary"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "JobDocumentFolder_projectId_deletedAt_idx" ON "JobDocumentFolder"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "LibraryDocument_companyId_libraryId_deletedAt_idx" ON "LibraryDocument"("companyId", "libraryId", "deletedAt");

-- CreateIndex
CREATE INDEX "LibraryDocument_projectId_deletedAt_idx" ON "LibraryDocument"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_createdAt_idx" ON "DocumentVersion"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentVersion_fileId_idx" ON "DocumentVersion"("fileId");

-- CreateIndex
CREATE INDEX "DocumentLink_projectId_idx" ON "DocumentLink"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLink_documentId_projectId_key" ON "DocumentLink"("documentId", "projectId");

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "DocumentLibrary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "JobDocumentFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "JobDocumentFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

