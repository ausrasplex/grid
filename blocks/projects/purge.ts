// Deleting a business (docs/roadmap.md "Deleting a business"): jobs. A job another business is still on stays (it's
// handed to that business); only this business's part of it goes.
// companyUsage is shown before someone deletes it; purgeCompany runs in the
// storage clean-up once Recently deleted has run out. Files go afterwards
// (the clean-up removes every StoredFile of the business), so only rows here.

import type { LevelUsage } from "@grid/core";
import { db } from "@grid/db";

export async function companyUsage(companyId: string): Promise<LevelUsage[]> {
  return [{ count: await db.project.count({ where: { hostCompanyId: companyId, deletedAt: null } }), one: "job", many: "jobs" }];
}

export async function purgeCompany(companyId: string): Promise<void> {
  const [links, hosted] = await Promise.all([
    db.projectCompany.findMany({ where: { companyId }, select: { projectId: true } }),
    db.project.findMany({ where: { hostCompanyId: companyId }, select: { id: true } }),
  ]);
  const projectIds = [...new Set([...links.map((link) => link.projectId), ...hosted.map((project) => project.id)])];
  await db.$transaction(async (tx) => {
    await tx.projectReference.deleteMany({ where: { companyId } });
    await tx.projectCompany.deleteMany({ where: { companyId } });
    for (const projectId of projectIds) {
      const other = await tx.projectCompany.findFirst({ where: { projectId }, orderBy: { createdAt: "asc" }, select: { companyId: true } });
      if (other) {
        // Someone else is still on it: they become its host if it was ours.
        await tx.project.updateMany({ where: { id: projectId, hostCompanyId: companyId }, data: { hostCompanyId: other.companyId } });
        continue;
      }
      await tx.userProjectLevel.deleteMany({ where: { projectId } });
      // Covers and references go with the job (cascade).
      await tx.project.delete({ where: { id: projectId } });
    }
  });
}

/** A deleted job, for good: the job, its areas, businesses on it and route code. Runs after every other Block's part. */
export async function purgeProject(projectId: string): Promise<string[]> {
  await db.$transaction(async (tx) => {
    await tx.userProjectLevel.deleteMany({ where: { projectId } });
    await tx.projectCompany.deleteMany({ where: { projectId } });
    await tx.routeCode.deleteMany({ where: { entityType: "Project", entityId: projectId } });
    // Covers and references go with the job (cascade). The activity log keeps its entries.
    await tx.project.delete({ where: { id: projectId } });
  });
  return [];
}
