// Deleting a business (docs/roadmap.md "Deleting a business"): plan sheets, their revisions and the zoom tiles.
// companyUsage is shown before someone deletes it; purgeCompany runs in the
// storage clean-up once Recently deleted has run out. Files go afterwards
// (the clean-up removes every StoredFile of the business), so only rows here.

import type { LevelUsage } from "@grid/core";
import { db } from "@grid/db";
import { removeTiles } from "./pdf";

export async function companyUsage(companyId: string): Promise<LevelUsage[]> {
  return [{ count: await db.planSheet.count({ where: { companyId, deletedAt: null, purgedAt: null } }), one: "plan sheet", many: "plan sheets" }];
}

export async function purgeCompany(companyId: string): Promise<void> {
  const sheets = await db.planSheet.findMany({ where: { companyId }, select: { versions: { select: { id: true } } } });
  for (const sheet of sheets) for (const version of sheet.versions) await removeTiles(version.id);
  // Revisions go with each sheet (cascade).
  await db.planSheet.deleteMany({ where: { companyId } });
}
