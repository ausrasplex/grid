// Deleting a business (docs/roadmap.md "Deleting a business"): its materials,
// brands and families. Photos go afterwards (the clean-up removes every
// StoredFile of the business), so only rows here. Quotes' purge runs first
// (it depends on this Block), so no price list item still points here.

import type { LevelUsage } from "@grid/core";
import { db } from "@grid/db";

export async function companyUsage(companyId: string): Promise<LevelUsage[]> {
  return [{ count: await db.material.count({ where: { companyId, deletedAt: null } }), one: "material", many: "materials" }];
}

export async function purgeCompany(companyId: string): Promise<void> {
  await db.material.deleteMany({ where: { companyId } });
  await db.materialFamily.deleteMany({ where: { companyId } });
  await db.materialBrand.deleteMany({ where: { companyId } });
}
