-- Addresses in parts (docs/stage-2-projects.md "Addresses"): street, suburb,
-- state, postcode, country and where it is, next to the one-line address.
-- Existing addresses are split up when the server starts (splitExistingAddresses).
-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "country" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "placeId" TEXT,
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "suburb" TEXT;

-- AlterTable
ALTER TABLE "ClientBusiness" ADD COLUMN     "country" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "placeId" TEXT,
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "suburb" TEXT;

-- AlterTable
ALTER TABLE "DocTheme" ADD COLUMN     "country" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "placeId" TEXT,
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "suburb" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "siteCountry" TEXT,
ADD COLUMN     "siteLatitude" DOUBLE PRECISION,
ADD COLUMN     "siteLongitude" DOUBLE PRECISION,
ADD COLUMN     "sitePlaceId" TEXT,
ADD COLUMN     "sitePostcode" TEXT,
ADD COLUMN     "siteState" TEXT,
ADD COLUMN     "siteStreet" TEXT,
ADD COLUMN     "siteSuburb" TEXT;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "country" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "placeId" TEXT,
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "suburb" TEXT;

-- CreateIndex
CREATE INDEX "Site_suburb_postcode_idx" ON "Site"("suburb", "postcode");
