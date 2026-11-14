-- Site notes become separate notes, each with a title ("Security office",
-- "Lockbox"…). A site's existing notes become one note called "Site notes".

-- CreateTable
CREATE TABLE "SiteNote" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "SiteNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteNote_siteId_sort_idx" ON "SiteNote"("siteId", "sort");

-- Move the old notes across (who wrote them wasn't kept).
INSERT INTO "SiteNote" ("id", "siteId", "companyId", "title", "body", "sort", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s."id", s."ownerCompanyId", 'Site notes', btrim(s."notes"), 0, s."updatedAt", s."updatedAt"
FROM "Site" s
WHERE s."notes" IS NOT NULL AND btrim(s."notes") <> '';

-- AlterTable
ALTER TABLE "Site" DROP COLUMN "notes";
