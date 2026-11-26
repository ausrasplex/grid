// Checklist items are rows only (no files). They go with a deleted job,
// and with a deleted business.

import { db } from "@grid/db";

export async function purgeProject(projectId: string): Promise<string[]> {
  await db.checklistItem.deleteMany({ where: { projectId } });
  return [];
}

export async function purgeCompany(companyId: string): Promise<void> {
  await db.checklistItem.deleteMany({ where: { companyId } });
}
