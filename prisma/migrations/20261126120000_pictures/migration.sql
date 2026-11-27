-- Pictures: a business picture for each business (and its team until they add their own), a choice to
-- share your own photo on business cards (off), and logos and photos in the Clients list.
-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "photoKey" TEXT;

-- AlterTable
ALTER TABLE "ClientBusiness" ADD COLUMN     "logoKey" TEXT;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "logoFromBranding" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sharePhotoOnCards" BOOLEAN NOT NULL DEFAULT false;
