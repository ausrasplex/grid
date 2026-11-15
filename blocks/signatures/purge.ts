// Deleting a business (docs/roadmap.md "Deleting a business"): signing links this business sent (their events go with them).
// companyUsage is shown before someone deletes it; purgeCompany runs in the
// storage clean-up once Recently deleted has run out. Files go afterwards
// (the clean-up removes every StoredFile of the business), so only rows here.

import { db } from "@grid/db";

export async function purgeCompany(companyId: string): Promise<void> {
  await db.signRequest.deleteMany({ where: { companyId } });
}
