// Deleting a job or a business (docs/roadmap.md "Deleting a business",
// docs/stage-2-projects.md "Deleting a job"): handover lines, settings,
// links and the cached PDFs. Materials and their photos belong to Materials.

import type { LevelUsage } from "@grid/core";
import { db } from "@grid/db";
import { dropCache } from "./pdf";

export async function companyUsage(companyId: string): Promise<LevelUsage[]> {
  const jobs = await db.handoverItem.groupBy({ by: ["projectId"], where: { companyId } });
  return [{ count: jobs.length, one: "job handover list", many: "job handover lists" }];
}

export async function purgeCompany(companyId: string): Promise<void> {
  const jobs = await db.handoverSettings.findMany({ where: { companyId }, select: { projectId: true } });
  const lists = await db.handoverItem.groupBy({ by: ["projectId"], where: { companyId } });
  for (const projectId of new Set([...jobs, ...lists].map((row) => row.projectId))) await dropCache(projectId);
  await db.handoverShare.deleteMany({ where: { companyId } });
  await db.handoverItem.deleteMany({ where: { companyId } });
  await db.handoverSettings.deleteMany({ where: { companyId } });
  await db.handoverCompanySettings.deleteMany({ where: { companyId } });
}

/** A deleted job, for good. Returns its cover picture so the clean-up removes it. */
export async function purgeProject(projectId: string): Promise<string[]> {
  const settings = await db.handoverSettings.findUnique({ where: { projectId }, select: { coverFileId: true } });
  await dropCache(projectId);
  await db.$transaction(async (tx) => {
    await tx.handoverShare.deleteMany({ where: { projectId } });
    await tx.handoverItem.deleteMany({ where: { projectId } });
    await tx.handoverSettings.deleteMany({ where: { projectId } });
  });
  return settings?.coverFileId ? [settings.coverFileId] : [];
}
