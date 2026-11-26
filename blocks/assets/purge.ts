// Deleting a business (docs/roadmap.md "Deleting a business"): its assets,
// categories and settings. Photos go afterwards (the clean-up removes every
// StoredFile of the business); tag codes are left revoked, so a printed
// sticker is still recognised as no longer working.

import type { LevelUsage } from "@grid/core";
import { db } from "@grid/db";

export async function companyUsage(companyId: string): Promise<LevelUsage[]> {
  return [{ count: await db.asset.count({ where: { companyId, deletedAt: null } }), one: "asset", many: "assets" }];
}

export async function purgeCompany(companyId: string): Promise<void> {
  const assets = await db.asset.findMany({ where: { companyId }, select: { id: true } });
  await db.routeCode.updateMany({ where: { entityType: "Asset", entityId: { in: assets.map((asset) => asset.id) }, revokedAt: null }, data: { revokedAt: new Date() } });
  await db.assetCustody.deleteMany({ where: { companyId } });
  await db.assetFault.deleteMany({ where: { companyId } });
  await db.assetLoss.deleteMany({ where: { companyId } });
  await db.assetCheck.deleteMany({ where: { companyId } });
  await db.assetBooking.deleteMany({ where: { companyId } });
  await db.assetRoutine.deleteMany({ where: { companyId } });
  await db.assetDocument.deleteMany({ where: { companyId } });
  await db.assetPart.deleteMany({ where: { companyId } });
  await db.asset.deleteMany({ where: { companyId } });
  await db.assetCategory.deleteMany({ where: { companyId } });
  await db.assetSettings.deleteMany({ where: { companyId } });
}

/**
 * Deleting a job (docs/stage-2-projects.md "Deleting a job"): moves that
 * mention it keep the job's name as written (placeName) but lose the link.
 * Gear still with someone stays with them. No files here.
 */
export async function purgeProject(projectId: string): Promise<string[]> {
  await db.assetCustody.updateMany({ where: { projectId }, data: { projectId: null, siteId: null, buildingId: null, levelId: null } });
  await db.assetFault.updateMany({ where: { projectId }, data: { projectId: null, siteId: null, buildingId: null, levelId: null } });
  return [];
}

/** Gear on a level right now, so a floor with gear on it isn't deleted. */
export async function levelUsage(levelId: string): Promise<LevelUsage[]> {
  const count = await db.assetCustody.count({ where: { levelId, toAt: null, asset: { deletedAt: null } } });
  return count ? [{ count, one: "asset", many: "assets" }] : [];
}
