-- Lead source on clients (docs/quotations-block.md "Lead source"), with a job override.
-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "leadSourceId" TEXT,
ADD COLUMN     "referredByClientId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "leadSourceId" TEXT;

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isReferral" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadSource_companyId_sortOrder_idx" ON "LeadSource"("companyId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSource_companyId_name_key" ON "LeadSource"("companyId", "name");

-- CreateIndex
CREATE INDEX "Client_leadSourceId_idx" ON "Client"("leadSourceId");

-- CreateIndex
CREATE INDEX "Client_referredByClientId_idx" ON "Client"("referredByClientId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_leadSourceId_fkey" FOREIGN KEY ("leadSourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_referredByClientId_fkey" FOREIGN KEY ("referredByClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

