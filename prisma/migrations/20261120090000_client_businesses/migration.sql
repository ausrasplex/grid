-- Clients: businesses with people under them (Honeywell → its Project Manager, its Service Technician).
-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "businessId" TEXT,
ADD COLUMN     "role" TEXT;

-- CreateTable
CREATE TABLE "ClientBusiness" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abn" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClientBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientBusiness_companyId_name_idx" ON "ClientBusiness"("companyId", "name");

-- CreateIndex
CREATE INDEX "Client_businessId_idx" ON "Client"("businessId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "ClientBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

