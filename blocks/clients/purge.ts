// Deleting a business (docs/roadmap.md "Deleting a business"): this business's clients.
// companyUsage is shown before someone deletes it; purgeCompany runs in the
// storage clean-up once Recently deleted has run out. Files go afterwards
// (the clean-up removes every StoredFile of the business), so only rows here.

import type { LevelUsage } from "@grid/core";
import { db } from "@grid/db";

export async function companyUsage(companyId: string): Promise<LevelUsage[]> {
  return [{ count: await db.client.count({ where: { companyId, deletedAt: null } }), one: "client", many: "clients" }];
}

export async function purgeCompany(companyId: string): Promise<void> {
  await db.client.deleteMany({ where: { companyId } });
  await db.clientBusiness.deleteMany({ where: { companyId } });
  await db.leadSource.deleteMany({ where: { companyId } });
}
