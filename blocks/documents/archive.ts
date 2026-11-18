// Archived jobs (phase 2e, docs/stage-2-projects.md "Job storage"): a job's
// own documents lose their page pictures and sheet data on archive
// ("documents.archive", queued on "projects.archived"). Opening a document
// makes them again for a quick look (getDocument), the nightly clean-up
// removes them again once not opened for a while, and restoring makes them
// all again for good ("documents.restore"). Library documents pinned to an
// archived job aren't touched: they belong to the library.

import "server-only";
import { app, conflict, type CleanupItem } from "@grid/core";
import { db, folderBytes } from "@grid/db";
import { archivedJobIds, isJobArchived, jobLabelsForSystem } from "@grid/block-projects";
import { pagesDir, removePages } from "./render";

/** Has page pictures or sheet data in the cache: a drawn PDF or a read spreadsheet (a photo has neither). */
const hasCopies = (version: { pageSizes: unknown; sheets: unknown }) => (Array.isArray(version.pageSizes) && version.pageSizes.length > 0) || version.sheets !== null;

async function drop(versionIds: string[]) {
  for (const versionId of versionIds) {
    await removePages(versionId);
    await db.documentVersion.update({ where: { id: versionId }, data: { copiesDroppedAt: new Date(), openedAt: null, cacheBytes: 0 } });
  }
}

/** "documents.archive": drop the copies of every job document version. */
export async function dropForJob(projectId: string) {
  if (!(await isJobArchived(projectId))) return; // restored again before this ran
  const versions = await db.documentVersion.findMany({
    where: { status: "READY", copiesDroppedAt: null, document: { projectId, purgedAt: null } },
    select: { id: true, pageSizes: true, sheets: true },
  });
  await drop(versions.filter(hasCopies).map((version) => version.id));
}

/** "documents.restore": make every dropped version's copies again, for good. */
export async function restoreJob(projectId: string) {
  if (await isJobArchived(projectId)) return; // archived again before this ran
  const versions = await db.documentVersion.findMany({ where: { copiesDroppedAt: { not: null }, document: { projectId, purgedAt: null } }, select: { id: true } });
  await db.documentVersion.updateMany({ where: { document: { projectId } }, data: { openedAt: null } });
  await db.documentVersion.updateMany({ where: { id: { in: versions.map((version) => version.id) } }, data: { status: "PENDING", error: null } });
  for (const version of versions) await app().jobs.send("documents.render", { versionId: version.id });
  return { queued: versions.length };
}

/**
 * A document on an archived job was opened: note when, and make the shown
 * version's copies again if they were dropped. Returns true when it's now
 * being made (the screen shows "getting ready").
 */
export async function openOnArchivedJob(versionId: string): Promise<boolean> {
  const version = await db.documentVersion.findUnique({ where: { id: versionId }, select: { status: true, copiesDroppedAt: true } });
  if (!version) return false;
  if (version.copiesDroppedAt && version.status === "READY") {
    await db.documentVersion.update({ where: { id: versionId }, data: { status: "PENDING", error: null, openedAt: new Date() } });
    await app().jobs.send("documents.render", { versionId });
    return true;
  }
  await db.documentVersion.update({ where: { id: versionId }, data: { openedAt: new Date() } });
  return false;
}

/** Adding to an archived job isn't allowed: restore it first. */
export async function assertNotArchived(projectId: string) {
  if (await isJobArchived(projectId)) throw conflict("This job is archived. Restore it to add or change documents.");
}

/** Nightly clean-up: copies on archived jobs not opened since `openedBefore` go again. */
export async function dropArchivedCopies(options: { openedBefore: Date; dryRun: boolean }): Promise<CleanupItem[]> {
  const projectIds = await archivedJobIds();
  if (!projectIds.length) return [];
  const found = await db.documentVersion.findMany({
    where: {
      status: "READY",
      copiesDroppedAt: null,
      document: { projectId: { in: projectIds }, purgedAt: null },
      OR: [{ openedAt: null }, { openedAt: { lt: options.openedBefore } }],
    },
    select: { id: true, cacheBytes: true, pageSizes: true, sheets: true, document: { select: { companyId: true, projectId: true, title: true } } },
    take: 5000,
  });
  const versions = found.filter(hasCopies);
  if (!versions.length) return [];
  const jobs = await jobLabelsForSystem(versions.map((version) => version.document.projectId!));
  const items: CleanupItem[] = [];
  for (const version of versions) {
    items.push({
      companyId: version.document.companyId,
      kind: "archived-copy",
      label: `Pages of "${version.document.title}", ${jobs.get(version.document.projectId!) ?? "an archived job"}`,
      refId: version.id,
      bytes: version.cacheBytes ?? (await folderBytes(pagesDir(version.id))),
    });
  }
  if (!options.dryRun) await drop(versions.map((version) => version.id));
  return items;
}
