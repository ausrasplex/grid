-- Deleting a business: who deleted it, and when it was removed for good.
ALTER TABLE "Company" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "Company" ADD COLUMN "purgedAt" TIMESTAMP(3);
