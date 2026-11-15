// Deleting a business (docs/roadmap.md "Deleting a business"): job photos, notes and comments.
// companyUsage is shown before someone deletes it; purgeCompany runs in the
// storage clean-up once Recently deleted has run out. Files go afterwards
// (the clean-up removes every StoredFile of the business), so only rows here.

import type { LevelUsage } from "@grid/core";
import { db } from "@grid/db";

export async function companyUsage(companyId: string): Promise<LevelUsage[]> {
  const [photos, notes] = await Promise.all([
    db.jobPhoto.count({ where: { companyId, deletedAt: null } }),
    db.jobNote.count({ where: { companyId, deletedAt: null } }),
  ]);
  return [
    { count: photos, one: "photo", many: "photos" },
    { count: notes, one: "note", many: "notes" },
  ];
}

export async function purgeCompany(companyId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.photoComment.deleteMany({ where: { companyId } });
    await tx.jobPhoto.deleteMany({ where: { companyId } });
    await tx.jobNote.deleteMany({ where: { companyId } });
  });
}
