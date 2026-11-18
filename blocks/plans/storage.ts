// What plans keep on disk for each job (the job's Storage section and the
// Jobs table), and the nightly "plans.measure" that records the tile size
// of sheets drawn before sizes were kept. docs/stage-2-projects.md "Job storage".

import "server-only";
import type { JobStorageLine } from "@grid/core";
import { db, folderBytes } from "@grid/db";
import { tilesDir } from "./pdf";

export async function jobStorage(companyId: string, projectIds: string[]): Promise<JobStorageLine[]> {
  if (!projectIds.length) return [];
  const sheets = await db.planSheet.findMany({
    where: { companyId, projectId: { in: projectIds }, purgedAt: null },
    select: { projectId: true, deletedAt: true, versions: { select: { fileId: true, status: true, cacheBytes: true } } },
  });
  const fileIds = [...new Set(sheets.flatMap((sheet) => sheet.versions.map((version) => version.fileId)))];
  const files = new Map(
    (await db.storedFile.findMany({ where: { id: { in: fileIds }, purgedAt: null }, select: { id: true, size: true } })).map((file) => [file.id, file.size]),
  );

  const lines = new Map<string, JobStorageLine>();
  // One PDF can hold several sheets: count it once per job, as live if any live sheet uses it.
  const liveFiles = new Map<string, Set<string>>();
  const deletedFiles = new Map<string, Set<string>>();
  for (const sheet of sheets) {
    const line =
      lines.get(sheet.projectId) ??
      { projectId: sheet.projectId, key: "plans.sheets", label: "Plans", count: 0, one: "plan sheet", many: "plan sheets", originalBytes: 0, copyBytes: 0, deletedBytes: 0, unmeasured: 0 };
    lines.set(sheet.projectId, line);
    const deleted = !!sheet.deletedAt;
    if (!deleted) line.count += 1;
    const into = deleted ? deletedFiles : liveFiles;
    const seen = into.get(sheet.projectId) ?? new Set<string>();
    into.set(sheet.projectId, seen);
    for (const version of sheet.versions) {
      seen.add(version.fileId);
      if (version.status !== "READY") continue;
      if (version.cacheBytes === null) {
        if (!deleted) line.unmeasured += 1;
      } else if (deleted) line.deletedBytes += version.cacheBytes;
      else line.copyBytes += version.cacheBytes;
    }
  }
  for (const [projectId, line] of lines) {
    const live = liveFiles.get(projectId) ?? new Set<string>();
    for (const fileId of live) line.originalBytes += files.get(fileId) ?? 0;
    for (const fileId of deletedFiles.get(projectId) ?? []) if (!live.has(fileId)) line.deletedBytes += files.get(fileId) ?? 0;
  }
  return [...lines.values()];
}

/** Nightly: tile sizes for sheets drawn before Grid recorded them (a few thousand a night at most). */
export async function measure() {
  const versions = await db.planVersion.findMany({ where: { status: "READY", cacheBytes: null }, select: { id: true }, take: 5000 });
  for (const version of versions) {
    await db.planVersion.update({ where: { id: version.id }, data: { cacheBytes: await folderBytes(tilesDir(version.id)) } });
  }
  return { measured: versions.length };
}
