// The storage clean-up: documents deleted longer ago than Recently deleted
// keeps them, and deleting a whole business (docs/roadmap.md "Deleting a
// business"). Files of a deleted business go afterwards (the clean-up
// removes every StoredFile of the business), so only rows and page
// pictures here.

import type { CleanupItem, LevelUsage } from "@grid/core";
import { db, purgeStoredFile, storedBytes } from "@grid/db";
import { removePages } from "./render";

export async function purgeDeleted(options: { before: Date; dryRun: boolean }): Promise<CleanupItem[]> {
  const documents = await db.libraryDocument.findMany({ where: { deletedAt: { lt: options.before }, purgedAt: null }, include: { versions: true }, take: 2000 });
  const items: CleanupItem[] = [];
  for (const document of documents) {
    const files = await db.storedFile.findMany({ where: { id: { in: document.versions.map((version) => version.fileId) }, purgedAt: null } });
    const bytes = files.reduce((total, file) => total + storedBytes(file), 0);
    const versions = document.versions.length;
    items.push({ companyId: document.companyId, kind: "deleted-document", label: `Document ${document.title}${versions > 1 ? ` (${versions} versions)` : ""}`, refId: document.id, bytes });
    if (options.dryRun) continue;
    for (const version of document.versions) await removePages(version.id);
    await db.$transaction(async (tx) => {
      for (const file of files) await purgeStoredFile(tx, file.id);
      await tx.documentPage.deleteMany({ where: { documentId: document.id } });
      await tx.iconDocumentLink.deleteMany({ where: { documentId: document.id } });
      await tx.libraryDocument.update({ where: { id: document.id }, data: { purgedAt: new Date() } });
    });
  }
  return items;
}

export async function companyUsage(companyId: string): Promise<LevelUsage[]> {
  return [{ count: await db.libraryDocument.count({ where: { companyId, deletedAt: null, purgedAt: null } }), one: "document", many: "documents" }];
}

export async function purgeCompany(companyId: string): Promise<void> {
  const versions = await db.documentVersion.findMany({ where: { document: { companyId } }, select: { id: true } });
  for (const version of versions) await removePages(version.id);
  await db.$transaction(async (tx) => {
    // Versions and pins go with each document (cascade).
    await tx.documentPage.deleteMany({ where: { companyId } });
    await tx.iconDocumentLink.deleteMany({ where: { companyId } });
    await tx.libraryDocument.deleteMany({ where: { companyId } });
    await tx.documentLink.deleteMany({ where: { companyId } });
    await tx.jobDocumentFolder.deleteMany({ where: { companyId } });
    await tx.documentLibrary.deleteMany({ where: { companyId } });
    await tx.documentSettings.deleteMany({ where: { companyId } });
  });
}
