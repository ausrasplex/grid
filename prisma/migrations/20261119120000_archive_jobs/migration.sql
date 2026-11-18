-- Phase 2e: archiving finished jobs. Big viewing copies (plan tiles, document
-- pages) are dropped and drawn again for a quick look when opened.
ALTER TABLE "Project" ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedById" TEXT;

ALTER TABLE "PlanVersion" ADD COLUMN "tilesDroppedAt" TIMESTAMP(3),
ADD COLUMN "openedAt" TIMESTAMP(3);

ALTER TABLE "DocumentVersion" ADD COLUMN "copiesDroppedAt" TIMESTAMP(3),
ADD COLUMN "openedAt" TIMESTAMP(3);
