-- Shared plan links (docs/plans-block.md "Sharing plans"): a private link to some of a job's sheets.
-- CreateTable
CREATE TABLE "PlanShare" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "sheetIds" JSONB NOT NULL,
    "layerIds" JSONB NOT NULL,
    "withDefault" BOOLEAN NOT NULL DEFAULT true,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastOpenedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlanShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanShare_tokenHash_key" ON "PlanShare"("tokenHash");

-- CreateIndex
CREATE INDEX "PlanShare_projectId_revokedAt_idx" ON "PlanShare"("projectId", "revokedAt");

-- CreateIndex
CREATE INDEX "PlanShare_companyId_idx" ON "PlanShare"("companyId");

