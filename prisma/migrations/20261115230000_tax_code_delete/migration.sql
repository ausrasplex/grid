-- Deleting a tax rate: hidden, but kept for quotes already sent with it.
ALTER TABLE "TaxCode" ADD COLUMN "deletedAt" TIMESTAMP(3);
