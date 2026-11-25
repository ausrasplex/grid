-- Clients: room to link a contact card to the real Grid business and account later (contract chain). Empty for now.
-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "linkedUserId" TEXT;

-- AlterTable
ALTER TABLE "ClientBusiness" ADD COLUMN     "linkedCompanyId" TEXT;
