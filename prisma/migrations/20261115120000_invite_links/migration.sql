-- Join links for invites (/join/<token>), for sending by hand when the server has no email.
-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteTokenEnc" TEXT,
ADD COLUMN     "inviteTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Membership_inviteTokenHash_key" ON "Membership"("inviteTokenHash");
