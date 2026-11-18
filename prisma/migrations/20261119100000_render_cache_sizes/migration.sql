-- Phase 2e: how much each render adds to the cache (job Storage section).
-- Older renders stay null until the nightly plans.measure / documents.measure.
ALTER TABLE "DocumentVersion" ADD COLUMN "cacheBytes" INTEGER;

ALTER TABLE "PlanVersion" ADD COLUMN "cacheBytes" INTEGER;
