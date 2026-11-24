-- Handover Block (docs/materials-block.md §2–§3): a job's list of what's
-- installed by trade and room, its sheet settings, the business's handover
-- settings, and the client's private link.
-- CreateEnum
CREATE TYPE "HandoverSource" AS ENUM ('MANUAL', 'PLANS', 'QUOTE');

-- CreateTable
CREATE TABLE "HandoverItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "room" TEXT,
    "qty" DECIMAL(12,3),
    "note" TEXT,
    "source" "HandoverSource" NOT NULL DEFAULT 'MANUAL',
    "sourceRef" TEXT,
    "editedByHand" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandoverItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverSettings" (
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "showQty" BOOLEAN NOT NULL DEFAULT true,
    "roomPerPage" BOOLEAN NOT NULL DEFAULT false,
    "roomOrder" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cover" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT,
    "coverFileId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandoverSettings_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "HandoverCompanySettings" (
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Fixtures & Finishes Schedule',
    "tradeNames" JSONB NOT NULL DEFAULT '{}',
    "tradeColumns" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandoverCompanySettings_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "HandoverShare" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "clientId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "lastOpenedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoverShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HandoverItem_projectId_idx" ON "HandoverItem"("projectId");

-- CreateIndex
CREATE INDEX "HandoverItem_companyId_materialId_idx" ON "HandoverItem"("companyId", "materialId");

-- CreateIndex
CREATE INDEX "HandoverSettings_companyId_idx" ON "HandoverSettings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoverShare_tokenHash_key" ON "HandoverShare"("tokenHash");

-- CreateIndex
CREATE INDEX "HandoverShare_projectId_revokedAt_idx" ON "HandoverShare"("projectId", "revokedAt");

-- CreateIndex
CREATE INDEX "HandoverShare_companyId_idx" ON "HandoverShare"("companyId");

