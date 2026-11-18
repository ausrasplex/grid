// Archived jobs (phase 2e, docs/stage-2-projects.md "Job storage"):
//   - archiving drops each revision's tiles, keeping the thumbnail so the
//     sheet list still shows ("plans.archive", queued on "projects.archived")
//   - opening a sheet draws that revision again and notes when it was opened
//   - the nightly clean-up drops redrawn tiles not opened for a while
//   - restoring draws everything again, kept for good ("plans.restore")
// Markups, pins and scales are in sheet units, so they land in the same place.

import "server-only";
import { app, conflict, notFound, requireCompany, type CleanupItem, type RequestContext } from "@grid/core";
import { db, folderBytes } from "@grid/db";
import { archivedJobIds, canSeeJob, isJobArchived, jobLabelsForSystem } from "@grid/block-projects";
import { dropTiles, tilesDir } from "./pdf";

async function drop(versionIds: string[]) {
  for (const versionId of versionIds) {
    await dropTiles(versionId);
    await db.planVersion.update({ where: { id: versionId }, data: { tilesDroppedAt: new Date(), openedAt: null, cacheBytes: await folderBytes(tilesDir(versionId)) } });
  }
}

/** "plans.archive": drop the tiles of every revision on the job. */
export async function dropForJob(projectId: string) {
  if (!(await isJobArchived(projectId))) return; // restored again before this ran
  const versions = await db.planVersion.findMany({ where: { status: "READY", tilesDroppedAt: null, sheet: { projectId, purgedAt: null } }, select: { id: true } });
  await drop(versions.map((version) => version.id));
}

/** "plans.restore": draw every dropped revision again, for good. */
export async function restoreJob(projectId: string) {
  if (await isJobArchived(projectId)) return; // archived again before this ran
  const versions = await db.planVersion.findMany({ where: { tilesDroppedAt: { not: null }, sheet: { projectId, purgedAt: null } }, select: { id: true } });
  await db.planVersion.updateMany({ where: { sheet: { projectId } }, data: { openedAt: null } });
  await db.planVersion.updateMany({ where: { id: { in: versions.map((version) => version.id) } }, data: { status: "PENDING", error: null } });
  for (const version of versions) await app().jobs.send("plans.render", { versionId: version.id });
  return { queued: versions.length };
}

/**
 * The viewer opened a revision. On an archived job: note when, and draw it
 * again if its tiles were dropped (it shows "getting ready" meanwhile).
 */
export async function openVersion(ctx: RequestContext, versionId: string) {
  const companyId = requireCompany(ctx);
  const version = await db.planVersion.findFirst({ where: { id: versionId, sheet: { companyId, purgedAt: null } }, select: { id: true, status: true, tilesDroppedAt: true, sheet: { select: { projectId: true } } } });
  if (!version || !(await canSeeJob(ctx, version.sheet.projectId))) throw notFound("Sheet not found");
  if (!(await isJobArchived(version.sheet.projectId))) return { status: version.status, archived: false };
  if (version.tilesDroppedAt && version.status === "READY") {
    await db.planVersion.update({ where: { id: versionId }, data: { status: "PENDING", error: null, openedAt: new Date() } });
    await app().jobs.send("plans.render", { versionId });
    return { status: "PENDING" as const, archived: true };
  }
  await db.planVersion.update({ where: { id: versionId }, data: { openedAt: new Date() } });
  return { status: version.status, archived: true };
}

/** Uploading to an archived job isn't allowed: restore it first. */
export async function assertNotArchived(projectId: string) {
  if (await isJobArchived(projectId)) throw conflict("This job is archived. Restore it to add or change plans.");
}

/** Nightly clean-up: tiles on archived jobs not opened since `openedBefore` go again. */
export async function dropArchivedCopies(options: { openedBefore: Date; dryRun: boolean }): Promise<CleanupItem[]> {
  const projectIds = await archivedJobIds();
  if (!projectIds.length) return [];
  const versions = await db.planVersion.findMany({
    where: {
      status: "READY",
      tilesDroppedAt: null,
      sheet: { projectId: { in: projectIds }, purgedAt: null },
      OR: [{ openedAt: null }, { openedAt: { lt: options.openedBefore } }],
    },
    select: { id: true, revision: true, cacheBytes: true, sheet: { select: { companyId: true, projectId: true, number: true } } },
    take: 5000,
  });
  if (!versions.length) return [];
  const jobs = await jobLabelsForSystem(versions.map((version) => version.sheet.projectId));
  const items: CleanupItem[] = [];
  for (const version of versions) {
    const bytes = version.cacheBytes ?? (await folderBytes(tilesDir(version.id)));
    items.push({
      companyId: version.sheet.companyId,
      kind: "archived-copy",
      label: `Plan tiles for ${version.sheet.number}${version.revision ? ` rev ${version.revision}` : ""}, ${jobs.get(version.sheet.projectId) ?? "an archived job"}`,
      refId: version.id,
      bytes,
    });
  }
  if (!options.dryRun) await drop(versions.map((version) => version.id));
  return items;
}
