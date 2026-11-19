-- Custom icons: uploaded SVGs (made safe), and replacing a built-in icon's look.
-- AlterTable
ALTER TABLE "CustomIcon" ADD COLUMN     "replacesKey" TEXT,
ADD COLUMN     "svg" TEXT,
ADD COLUMN     "tint" BOOLEAN NOT NULL DEFAULT false;

