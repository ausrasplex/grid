-- CreateEnum
CREATE TYPE "SignRequestStatus" AS ENUM ('OPEN', 'SIGNED', 'DECLINED', 'REVOKED');

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "acceptedOptions" JSONB,
ADD COLUMN     "signRequestId" TEXT,
ADD COLUMN     "viewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TaxSettings" ADD COLUMN     "onlineAccept" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "signDrawn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "signTyped" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "SignRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "docSha256" TEXT NOT NULL,
    "status" "SignRequestStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "codeVerifiedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signerName" TEXT,
    "signerTitle" TEXT,
    "signerCompany" TEXT,
    "signMethod" TEXT,
    "signatureFileId" TEXT,
    "details" JSONB,
    "signedPdfFileId" TEXT,
    "signedSha256" TEXT,
    "verifyCode" TEXT,
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,

    CONSTRAINT "SignRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    "data" JSONB,

    CONSTRAINT "SignatureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignRequest_tokenHash_key" ON "SignRequest"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "SignRequest_verifyCode_key" ON "SignRequest"("verifyCode");

-- CreateIndex
CREATE INDEX "SignRequest_blockId_refId_idx" ON "SignRequest"("blockId", "refId");

-- CreateIndex
CREATE INDEX "SignRequest_companyId_status_idx" ON "SignRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "SignatureEvent_requestId_at_idx" ON "SignatureEvent"("requestId", "at");

-- AddForeignKey
ALTER TABLE "SignatureEvent" ADD CONSTRAINT "SignatureEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SignRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
