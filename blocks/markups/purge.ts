// Deleting a business (docs/roadmap.md "Deleting a business"): markups (placed icons too), plan scales and job icon numbers.
// companyUsage is shown before someone deletes it; purgeCompany runs in the
// storage clean-up once Recently deleted has run out. Files go afterwards
// (the clean-up removes every StoredFile of the business), so only rows here.

import type { LevelUsage } from "@grid/core";
import { db } from "@grid/db";

export async function companyUsage(companyId: string): Promise<LevelUsage[]> {
  return [{ count: await db.planMarkup.count({ where: { companyId, deletedAt: null } }), one: "markup", many: "markups" }];
}

export async function purgeCompany(companyId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.planMarkup.deleteMany({ where: { companyId } });
    await tx.planScale.deleteMany({ where: { companyId } });
    await tx.jobIconVersion.deleteMany({ where: { companyId } });
    await tx.customIcon.deleteMany({ where: { companyId } });
  });
}
