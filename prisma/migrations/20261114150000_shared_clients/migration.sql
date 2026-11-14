-- One shared Clients list (clients block). The Client table stays as it is;
-- it just moves from the quotes block to the clients block, so quotes keep
-- their clientId with no database link (Blocks only link by id).
-- DropForeignKey
ALTER TABLE "Quote" DROP CONSTRAINT "Quote_clientId_fkey";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "clientId" TEXT;

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- Jobs had a typed customer name. Point each one at a client: an existing
-- client of the business with the same name, else a new one.
INSERT INTO "Client" ("id", "companyId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, named."companyId", named."name", now(), now()
FROM (
  SELECT DISTINCT ON (p."hostCompanyId", lower(btrim(p."clientName")))
    p."hostCompanyId" AS "companyId", btrim(p."clientName") AS "name"
  FROM "Project" p
  WHERE p."clientName" IS NOT NULL AND btrim(p."clientName") <> ''
  ORDER BY p."hostCompanyId", lower(btrim(p."clientName")), p."createdAt"
) named
WHERE NOT EXISTS (
  SELECT 1 FROM "Client" c
  WHERE c."companyId" = named."companyId" AND c."deletedAt" IS NULL AND lower(btrim(c."name")) = lower(named."name")
);

UPDATE "Project" p
SET "clientId" = (
  SELECT c."id" FROM "Client" c
  WHERE c."companyId" = p."hostCompanyId" AND c."deletedAt" IS NULL AND lower(btrim(c."name")) = lower(btrim(p."clientName"))
  ORDER BY c."createdAt"
  LIMIT 1
)
WHERE p."clientName" IS NOT NULL AND btrim(p."clientName") <> '';

-- Permissions moved from quotes to clients. Built-in roles are reset from
-- the Blocks at start-up; this keeps custom roles doing what they did.
UPDATE "Role" SET "permissions" = array_append("permissions", 'clients.view')
WHERE 'quotes.view' = ANY("permissions") AND NOT ('clients.view' = ANY("permissions"));
UPDATE "Role" SET "permissions" = array_append("permissions", 'clients.add')
WHERE 'quotes.create' = ANY("permissions") AND NOT ('clients.add' = ANY("permissions"));
UPDATE "Role" SET "permissions" = array_append(array_remove("permissions", 'quotes.clients.manage'), 'clients.manage')
WHERE 'quotes.clients.manage' = ANY("permissions") AND NOT ('clients.manage' = ANY("permissions"));
UPDATE "Role" SET "permissions" = array_remove("permissions", 'quotes.clients.manage')
WHERE 'quotes.clients.manage' = ANY("permissions");
