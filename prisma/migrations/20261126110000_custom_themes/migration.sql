-- CreateTable
CREATE TABLE "CustomTheme" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "ownerUserId" TEXT,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "look" TEXT NOT NULL DEFAULT 'grid',
    "startedFrom" TEXT NOT NULL DEFAULT 'grid',
    "keyColours" JSONB NOT NULL,
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomTheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomTheme_ownerUserId_idx" ON "CustomTheme"("ownerUserId");

-- CreateIndex
CREATE INDEX "CustomTheme_companyId_idx" ON "CustomTheme"("companyId");
