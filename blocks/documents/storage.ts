// What a job's own documents keep on disk (the job's Storage section and
// the Jobs table), and the nightly "documents.measure" for page pictures
// made before sizes were kept. Library documents pinned to a job aren't
// counted: they belong to the library. docs/stage-2-projects.md "Job storage".

import "server-only";
import type { JobStorageLine } from "@grid/core";
import { db, folderBytes, storedBytes } from "@grid/db";
import { documentKind } from "./kinds";
import { pagesDir } from "./render";

const hasCopies = (mime: string) => ["pdf", "spreadsheet"].includes(documentKind(mime));

export async function jobStorage(companyId: string, projectIds: string[]): Promise<JobStorageLine[]> {
  if (!projectIds.length) return [];
  const documents = await db.libraryDocument.findMany({
    where: { companyId, projectId: { in: projectIds }, purgedAt: null },
    select: { projectId: true, deletedAt: true, versions: { select: { fileId: true, status: true, cacheBytes: true } } },
  });
  const fileIds = documents.flatMap((document) => document.versions.map((version) => version.fileId));
  const files = new Map(
    (await db.storedFile.findMany({ where: { id: { in: fileIds }, purgedAt: null }, select: { id: true, size: true, mime: true, variants: true } })).map((file) => [file.id, file]),
  );

  const lines = new Map<string, JobStorageLine>();
  for (const document of documents) {
    const projectId = document.projectId!;
    const line =
      lines.get(projectId) ??
      { projectId, key: "documents.job", label: "Documents", count: 0, one: "document", many: "documents", originalBytes: 0, copyBytes: 0, deletedBytes: 0, unmeasured: 0 };
    lines.set(projectId, line);
    const deleted = !!document.deletedAt;
    if (!deleted) line.count += 1;
    for (const version of document.versions) {
      const file = files.get(version.fileId);
      if (!file) continue;
      const fileCopies = storedBytes(file) - file.size;
      const renderCopies = version.cacheBytes ?? 0;
      if (deleted) {
        line.deletedBytes += file.size + fileCopies + renderCopies;
        continue;
      }
      line.originalBytes += file.size;
      line.copyBytes += fileCopies + renderCopies;
      if (version.status === "READY" && version.cacheBytes === null && hasCopies(file.mime)) line.unmeasured += 1;
    }
  }
  return [...lines.values()];
}

/** Nightly: sizes for page pictures and sheet data made before Grid recorded them. */
export async function measure() {
  const versions = await db.documentVersion.findMany({ where: { status: "READY", cacheBytes: null }, select: { id: true }, take: 5000 });
  for (const version of versions) {
    await db.documentVersion.update({ where: { id: version.id }, data: { cacheBytes: await folderBytes(pagesDir(version.id)) } });
  }
  return { measured: versions.length };
}
