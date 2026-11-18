// What photos keep on disk for each job (the job's Storage section and the
// Jobs table): the photo as taken, plus its thumbnail and full-screen copy.
// Notes have no files. docs/stage-2-projects.md "Job storage".

import "server-only";
import type { JobStorageLine } from "@grid/core";
import { db, storedBytes } from "@grid/db";

export async function jobStorage(companyId: string, projectIds: string[]): Promise<JobStorageLine[]> {
  if (!projectIds.length) return [];
  const photos = await db.jobPhoto.findMany({ where: { companyId, projectId: { in: projectIds }, purgedAt: null }, select: { projectId: true, fileId: true, deletedAt: true } });
  const files = new Map(
    (await db.storedFile.findMany({ where: { id: { in: photos.map((photo) => photo.fileId) }, purgedAt: null }, select: { id: true, size: true, variants: true } })).map((file) => [file.id, file]),
  );
  const lines = new Map<string, JobStorageLine>();
  for (const photo of photos) {
    const line =
      lines.get(photo.projectId) ??
      { projectId: photo.projectId, key: "photos.photos", label: "Photos", count: 0, one: "photo", many: "photos", originalBytes: 0, copyBytes: 0, deletedBytes: 0, unmeasured: 0 };
    lines.set(photo.projectId, line);
    const file = files.get(photo.fileId);
    if (photo.deletedAt) {
      if (file) line.deletedBytes += storedBytes(file);
      continue;
    }
    line.count += 1;
    if (!file) continue;
    line.originalBytes += file.size;
    line.copyBytes += storedBytes(file) - file.size;
  }
  return [...lines.values()];
}
