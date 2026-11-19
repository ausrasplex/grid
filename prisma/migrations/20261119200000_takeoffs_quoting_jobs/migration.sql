-- Phase 4c part 2: Quoting jobs (a quote's job before it's won) and take-off
-- lines on quotes.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProjectStatus" ADD VALUE 'QUOTING';
ALTER TYPE "ProjectStatus" ADD VALUE 'NOT_WON';

-- AlterTable
ALTER TABLE "QuoteLine" ADD COLUMN     "takeoffKey" TEXT;

