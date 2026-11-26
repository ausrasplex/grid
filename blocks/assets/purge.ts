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
  await db.asset.deleteMany({ where: { companyId } });
  await db.assetCategory.deleteMany({ where: { companyId } });
  await db.assetSettings.deleteMany({ where: { companyId } });
}
