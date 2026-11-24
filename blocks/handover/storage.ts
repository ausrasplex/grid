// What handover keeps on disk for each job (the job's Storage section and
// the Jobs table): its cover picture and the cached PDF with its page
// pictures (made again when needed). docs/stage-2-projects.md "Job storage".

import "server-only";
import type { JobStorageLine } from "@grid/core";
import { db } from "@grid/db";
import { cachedBytes } from "./pdf";

export async function jobStorage(companyId: string, projectIds: string[]): Promise<JobStorageLine[]> {
  if (!projectIds.length) return [];
  const [counts, settings] = await Promise.all([
    db.handoverItem.groupBy({ by: ["projectId"], where: { companyId, projectId: { in: projectIds } }, _count: { _all: true } }),
    db.handoverSettings.findMany({ where: { companyId, projectId: { in: projectIds } }, select: { projectId: true, coverFileId: true } }),
  ]);
  const covers = new Map(
    (await db.storedFile.findMany({ where: { id: { in: settings.flatMap((row) => (row.coverFileId ? [row.coverFileId] : [])) }, purgedAt: null }, select: { id: true, size: true } })).map((file) => [file.id, file.size]),
  );
  const lines: JobStorageLine[] = [];
  for (const projectId of projectIds) {
    const count = counts.find((row) => row.projectId === projectId)?._count._all ?? 0;
    const cover = settings.find((row) => row.projectId === projectId)?.coverFileId;
    const copyBytes = await cachedBytes(projectId);
    if (!count && !cover && !copyBytes) continue;
    lines.push({
      projectId,
      key: "handover.list",
      label: "Handover",
      count,
      one: "handover line",
      many: "handover lines",
      originalBytes: cover ? (covers.get(cover) ?? 0) : 0,
      copyBytes,
      archiveBytes: copyBytes,
      deletedBytes: 0,
      unmeasured: 0,
    });
  }
  return lines;
}
