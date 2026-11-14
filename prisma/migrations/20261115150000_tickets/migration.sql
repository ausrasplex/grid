-- Phase 5a: My tickets & licences (each person's own).
-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "numberEnc" TEXT,
    "issuer" TEXT,
    "issuedOn" DATE,
    "expiresOn" DATE,
    "frontFileId" TEXT,
    "backFileId" TEXT,
    "notes" TEXT,
    "remindedAt" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Credential_userId_deletedAt_idx" ON "Credential"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Credential_expiresOn_idx" ON "Credential"("expiresOn");
