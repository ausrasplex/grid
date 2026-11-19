// Sign-offs are rows only (no files). They go when their document is
// purged for good (Recently deleted ran out), and with a deleted business.

import type { CleanupItem, LevelUsage } from "@grid/core";
import { db } from "@grid/db";

/** Sign-offs on documents that have been purged or no longer exist. */
export async function purgeDeleted(options: { before: Date; dryRun: boolean }): Promise<CleanupItem[]> {
  const documentIds = (await db.sheetSignoff.findMany({ distinct: ["documentId"], select: { documentId: true } })).map((row) => row.documentId);
  if (!documentIds.length) return [];
  const live = new Set((await db.libraryDocument.findMany({ where: { id: { in: documentIds }, purgedAt: null }, select: { id: true } })).map((document) => document.id));
  const gone = documentIds.filter((id) => !live.has(id));
  if (gone.length && !options.dryRun) {
    await db.$transaction(async (tx) => {
      await tx.sheetSignoff.deleteMany({ where: { documentId: { in: gone } } });
      await tx.sheetSignoffSettings.deleteMany({ where: { documentId: { in: gone } } });
    });
  }
  // Rows only: nothing on disk to list in the clean-up history.
  return [];
}

export async function companyUsage(companyId: string): Promise<LevelUsage[]> {
  return [{ count: await db.sheetSignoff.count({ where: { companyId, signedOff: true } }), one: "row sign-off", many: "row sign-offs" }];
}

export async function purgeCompany(companyId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.sheetSignoff.deleteMany({ where: { companyId } });
    await tx.sheetSignoffSettings.deleteMany({ where: { companyId } });
  });
}
