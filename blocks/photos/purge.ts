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

/** A deleted job, for good: its photos, notes and comments; the photos' files go after. */
export async function purgeProject(projectId: string): Promise<string[]> {
  const photos = await db.jobPhoto.findMany({ where: { projectId }, select: { fileId: true } });
  await db.$transaction(async (tx) => {
    await tx.photoComment.deleteMany({ where: { projectId } });
    await tx.jobPhoto.deleteMany({ where: { projectId } });
    await tx.jobNote.deleteMany({ where: { projectId } });
  });
  return photos.map((photo) => photo.fileId);
}
