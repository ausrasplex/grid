// Deleting a business (docs/roadmap.md "Deleting a business"): this business's site notes and its view of each site. A site
// goes too when nobody else uses it; otherwise another business takes it over.
// companyUsage is shown before someone deletes it; purgeCompany runs in the
// storage clean-up once Recently deleted has run out. Files go afterwards
// (the clean-up removes every StoredFile of the business), so only rows here.

import type { LevelUsage } from "@grid/core";
import { db } from "@grid/db";

export async function companyUsage(companyId: string): Promise<LevelUsage[]> {
  return [{ count: await db.siteCompanyState.count({ where: { companyId } }), one: "site", many: "sites" }];
}

export async function purgeCompany(companyId: string): Promise<void> {
  const owned = await db.site.findMany({ where: { ownerCompanyId: companyId }, select: { id: true } });
  await db.$transaction(async (tx) => {
    await tx.siteNote.deleteMany({ where: { companyId } });
    await tx.userSiteLocation.deleteMany({ where: { companyId } });
    await tx.siteCompanyState.deleteMany({ where: { companyId } });
    for (const site of owned) {
      // The clean-up removes jobs before sites, so any job still on the
      // site belongs to another business.
      const [other, jobs] = await Promise.all([
        tx.siteCompanyState.findFirst({ where: { siteId: site.id }, orderBy: { lastActivityAt: "desc" }, select: { companyId: true } }),
        tx.project.count({ where: { siteId: site.id } }),
      ]);
      if (other) {
        await tx.site.update({ where: { id: site.id }, data: { ownerCompanyId: other.companyId } });
        continue;
      }
      if (jobs) continue; // kept for the jobs on it
      await tx.userSiteLocation.deleteMany({ where: { siteId: site.id } });
      await tx.siteNote.deleteMany({ where: { siteId: site.id } });
      await tx.level.deleteMany({ where: { building: { siteId: site.id } } });
      await tx.building.deleteMany({ where: { siteId: site.id } });
      await tx.site.delete({ where: { id: site.id } });
    }
  });
}
