-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProjectListing" AS ENUM ('LISTED', 'UNLISTED');

-- CreateEnum
CREATE TYPE "ProjectCompanyStatus" AS ENUM ('INVITED', 'PENDING_PARENT', 'PENDING_PLACEMENT', 'ACTIVE', 'COMPLETED', 'REMOVED');

-- CreateEnum
CREATE TYPE "SiteKind" AS ENUM ('MANAGED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "BuildingKind" AS ENUM ('MULTI', 'SINGLE');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "hostCompanyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "listing" "ProjectListing" NOT NULL DEFAULT 'UNLISTED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCover" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "levelId" TEXT,

    CONSTRAINT "ProjectCover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCompany" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "parentId" TEXT,
    "status" "ProjectCompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedById" TEXT,
    "termsJson" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectReference" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProjectLevel" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "levelId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProjectLevel_pkey" PRIMARY KEY ("userId","projectId")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "kind" "SiteKind" NOT NULL,
    "ownerCompanyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "addressKey" TEXT NOT NULL,
    "notes" TEXT,
    "geofence" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "BuildingKind" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Level" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteCompanyState" (
    "siteId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "activeJobs" INTEGER NOT NULL DEFAULT 0,
    "totalJobs" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "keywords" TEXT NOT NULL DEFAULT '',
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteCompanyState_pkey" PRIMARY KEY ("siteId","companyId")
);

-- CreateTable
CREATE TABLE "UserSiteLocation" (
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "buildingId" TEXT,
    "levelId" TEXT,
    "projectId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSiteLocation_pkey" PRIMARY KEY ("userId","siteId")
);

-- CreateTable
CREATE TABLE "RouteCode" (
    "code" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "companyId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RouteCode_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "Project_siteId_status_idx" ON "Project"("siteId", "status");

-- CreateIndex
CREATE INDEX "Project_hostCompanyId_status_idx" ON "Project"("hostCompanyId", "status");

-- CreateIndex
CREATE INDEX "ProjectCover_buildingId_levelId_idx" ON "ProjectCover"("buildingId", "levelId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCover_projectId_buildingId_levelId_key" ON "ProjectCover"("projectId", "buildingId", "levelId");

-- CreateIndex
CREATE INDEX "ProjectCompany_companyId_status_idx" ON "ProjectCompany"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCompany_projectId_companyId_key" ON "ProjectCompany"("projectId", "companyId");

-- CreateIndex
CREATE INDEX "ProjectReference_companyId_value_idx" ON "ProjectReference"("companyId", "value");

-- CreateIndex
CREATE INDEX "ProjectReference_projectId_idx" ON "ProjectReference"("projectId");

-- CreateIndex
CREATE INDEX "Site_ownerCompanyId_addressKey_idx" ON "Site"("ownerCompanyId", "addressKey");

-- CreateIndex
CREATE INDEX "Site_addressKey_idx" ON "Site"("addressKey");

-- CreateIndex
CREATE INDEX "Building_siteId_idx" ON "Building"("siteId");

-- CreateIndex
CREATE INDEX "Level_buildingId_idx" ON "Level"("buildingId");

-- CreateIndex
CREATE INDEX "SiteCompanyState_companyId_archivedAt_idx" ON "SiteCompanyState"("companyId", "archivedAt");

-- CreateIndex
CREATE INDEX "UserSiteLocation_userId_companyId_updatedAt_idx" ON "UserSiteLocation"("userId", "companyId", "updatedAt");

-- CreateIndex
CREATE INDEX "RouteCode_entityType_entityId_idx" ON "RouteCode"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "ProjectCover" ADD CONSTRAINT "ProjectCover_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCompany" ADD CONSTRAINT "ProjectCompany_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReference" ADD CONSTRAINT "ProjectReference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Level" ADD CONSTRAINT "Level_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCompanyState" ADD CONSTRAINT "SiteCompanyState_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSiteLocation" ADD CONSTRAINT "UserSiteLocation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
