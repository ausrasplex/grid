-- Quotes made outside Grid: an uploaded PDF and the total written on it.
-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "uploadedFileId" TEXT,
ADD COLUMN     "uploadedTotal" DECIMAL(12,2);
