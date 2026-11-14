// Plans block service (phase 4a). Sheets belong to a job (project); each
// upload of a sheet is a version (revision). Uploads go through a review
// step: Grid guesses number, title and revision for each page and says
// whether it's a new sheet or a new revision, and you confirm.

import "server-only";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { app, badRequest, conflict, notFound, requireCompany, type CleanupItem, type RequestContext } from "@grid/core";
import { attachFile, audit, db, purgeStoredFile, storedBytes, storedFilePath, type Prisma, type Tx } from "@grid/db";
import { canSeeJob } from "@grid/block-projects";
import { disciplineName, disciplineOf, guessSheet } from "./parse";
import { pdfPages, removeTiles, renderToTiles, tilesDir, titleBlockText } from "./pdf";
import type { ImportRow, UpdateSheetInput } from "./validation";

const MOD = "plans";
const normaliseNumber = (sheetNumber: string) => sheetNumber.toUpperCase().replace(/[^A-Z0-9.]/g, "");
/** Disciplines in the order a set is usually bound. */
const ORDER = ["G", "SK", "A", "AR", "S", "ST", "C", "CV", "E", "CO", "D", "T", "SE", "AV", "M", "H", "P", "F", "FP", "V", "K", "L", "LA", "I", "ID"];
const discOrder = (discipline: string) => (ORDER.indexOf(discipline) === -1 ? 99 : ORDER.indexOf(discipline));

export function sortSheets<T extends { number: string; discipline: string }>(rows: T[]): T[] {
  return [...rows].sort((first, second) => discOrder(first.discipline) - discOrder(second.discipline) || first.number.localeCompare(second.number, "en", { numeric: true, sensitivity: "base" }));
}

async function jobOrThrow(ctx: RequestContext, projectId: string) {
  if (!(await canSeeJob(ctx, projectId))) throw notFound("Job not found");
}

async function ownSheet(tx: Tx, ctx: RequestContext, sheetId: string, options: { deleted?: boolean } = {}) {
  const companyId = requireCompany(ctx);
  const planSheet = await tx.planSheet.findFirst({ where: { id: sheetId, companyId, purgedAt: null, ...(options.deleted ? {} : { deletedAt: null }) } });
  if (!planSheet) throw notFound("Sheet not found");
  await jobOrThrow(ctx, planSheet.projectId);
  return planSheet;
}

// ---------------------------------------------------------------------
// Lists and the viewer
// ---------------------------------------------------------------------

const versionView = (version: Prisma.PlanVersionGetPayload<object>) => ({
  id: version.id,
  revision: version.revision,
  status: version.status,
  error: version.error,
  widthPx: version.widthPx,
  heightPx: version.heightPx,
  dpi: version.dpi,
  pageWidthPt: version.pageWidthPt,
  pageHeightPt: version.pageHeightPt,
  page: version.page,
  fileId: version.fileId,
  note: version.note,
  createdAt: version.createdAt,
  uploadedById: version.uploadedById,
});

/** A job's sheets, in set order, with their current revision. */
export async function listSheets(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  const sheets = await db.planSheet.findMany({
    where: { companyId, projectId, deletedAt: null },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });
  return sortSheets(
    sheets.map((sheet) => {
      const current = sheet.versions.find((version) => version.id === sheet.currentVersionId) ?? sheet.versions[0] ?? null;
      return {
        id: sheet.id,
        number: sheet.number,
        title: sheet.title,
        discipline: sheet.discipline,
        disciplineName: disciplineName(sheet.discipline),
        buildingId: sheet.buildingId,
        levelId: sheet.levelId,
        revisions: sheet.versions.length,
        current: current && versionView(current),
        /** A newer upload that isn't current (someone picked an older one). */
        newerExists: !!current && sheet.versions[0]!.id !== current.id,
        updatedAt: current?.createdAt ?? sheet.createdAt,
      };
    }),
  );
}

export type SheetRow = Awaited<ReturnType<typeof listSheets>>[number];

/** One sheet with all its revisions and its neighbours in the set. */
export async function getSheet(ctx: RequestContext, sheetId: string) {
  const sheet = await ownSheet(db, ctx, sheetId);
  const versions = await db.planVersion.findMany({ where: { sheetId }, orderBy: { createdAt: "desc" } });
  const all = await listSheets(ctx, sheet.projectId);
  const position = all.findIndex((entry) => entry.id === sheet.id);
  const names = new Map((await db.user.findMany({ where: { id: { in: versions.map((version) => version.uploadedById) } }, select: { id: true, name: true } })).map((user) => [user.id, user.name]));
  const files = new Map((await db.storedFile.findMany({ where: { id: { in: versions.map((version) => version.fileId) } }, select: { id: true, originalName: true, mime: true } })).map((file) => [file.id, file]));
  return {
    id: sheet.id,
    projectId: sheet.projectId,
    number: sheet.number,
    title: sheet.title,
    discipline: sheet.discipline,
    disciplineName: disciplineName(sheet.discipline),
    buildingId: sheet.buildingId,
    levelId: sheet.levelId,
    currentVersionId: sheet.currentVersionId ?? versions[0]?.id ?? null,
    versions: versions.map((version) => ({
      ...versionView(version),
      uploadedBy: names.get(version.uploadedById) ?? "Someone",
      fileName: files.get(version.fileId)?.originalName ?? null,
      fileIsPdf: files.get(version.fileId)?.mime === "application/pdf",
    })),
    prev: position > 0 ? { id: all[position - 1]!.id, number: all[position - 1]!.number } : null,
    next: position >= 0 && position < all.length - 1 ? { id: all[position + 1]!.id, number: all[position + 1]!.number } : null,
    set: all.map((sheet) => ({ id: sheet.id, number: sheet.number, title: sheet.title, discipline: sheet.discipline })),
  };
}

export type SheetView = Awaited<ReturnType<typeof getSheet>>;

/**
 * For Blocks that draw on a sheet (markups): the sheet, if you may see it,
 * and its revisions, newest first. Lighter than getSheet.
 */
export async function sheetForOverlay(ctx: RequestContext, sheetId: string) {
  const sheet = await ownSheet(db, ctx, sheetId);
  const versions = await db.planVersion.findMany({
    where: { sheetId },
    orderBy: { createdAt: "desc" },
    select: { id: true, revision: true, createdAt: true, pageWidthPt: true, pageHeightPt: true },
  });
  return { id: sheet.id, companyId: sheet.companyId, projectId: sheet.projectId, number: sheet.number, versions };
}

/** For the job page: how many sheets, and the ones for the area you're in. */
export async function sheetsForArea(ctx: RequestContext, projectId: string, area: { buildingId: string; levelId: string | null } | null) {
  const rows = await listSheets(ctx, projectId);
  const here = area ? rows.filter((row) => row.buildingId === area.buildingId && (row.levelId ?? null) === (area.levelId ?? null)) : [];
  return { total: rows.length, here, recent: [...rows].sort((first, second) => +second.updatedAt - +first.updatedAt).slice(0, 3) };
}

// ---------------------------------------------------------------------
// Upload: preview, then import
// ---------------------------------------------------------------------

async function myUploads(ctx: RequestContext, fileIds: string[]) {
  const companyId = requireCompany(ctx);
  const files = await db.storedFile.findMany({ where: { id: { in: fileIds }, companyId, deletedAt: null } });
  for (const id of fileIds) {
    const file = files.find((candidate) => candidate.id === id);
    if (!file) throw badRequest("One of the uploads has gone. Upload it again.");
    if (file.blockId && file.blockId !== MOD) throw badRequest("One of the files is already used elsewhere.");
    if (!file.blockId && file.createdById !== ctx.userId) throw badRequest("One of the uploads isn't yours.");
    if (file.mime !== "application/pdf" && !file.mime.startsWith("image/")) throw badRequest(`${file.originalName ?? "A file"} isn't a PDF or an image.`);
  }
  return files;
}

export interface PreviewRow {
  fileId: string;
  fileName: string;
  page: number;
  pages: number;
  number: string;
  title: string;
  revision: string;
  discipline: string;
  action: "new" | "revise" | "skip";
  sheetId: string | null;
  /** What's there now, for "revise" and "skip". */
  existing: { number: string; title: string; revision: string } | null;
  reason: string | null;
}

/** Reads each upload and says what it would do. Nothing is saved. */
export async function previewImport(ctx: RequestContext, projectId: string, fileIds: string[]): Promise<PreviewRow[]> {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  const files = await myUploads(ctx, fileIds);
  const sheets = await db.planSheet.findMany({
    where: { companyId, projectId, deletedAt: null },
    include: { versions: { select: { revision: true, fileId: true, page: true, createdAt: true }, orderBy: { createdAt: "desc" } } },
  });
  const shaOf = new Map((await db.storedFile.findMany({ where: { id: { in: sheets.flatMap((sheet) => sheet.versions.map((version) => version.fileId)) } }, select: { id: true, sha256: true } })).map((file) => [file.id, file.sha256]));

  const rows: PreviewRow[] = [];
  for (const id of fileIds) {
    const file = files.find((candidate) => candidate.id === id)!;
    const name = file.originalName ?? "Plan";
    const pages = file.mime === "application/pdf" ? await pdfPages(storedFilePath(file)) : [{ page: 1, widthPt: 0, heightPt: 0 }];
    if (!pages.length) throw badRequest(`${name} has no pages Grid can read.`);
    for (const page of pages) {
      const text = file.mime === "application/pdf" ? await titleBlockText(storedFilePath(file), page) : "";
      const guess = guessSheet(name, text, page.page, pages.length);
      const number = guess.number || (pages.length > 1 ? `Sheet ${page.page}` : name.replace(/\.[a-z0-9]+$/i, "").slice(0, 40));
      const match = sheets.find((sheet) => normaliseNumber(sheet.number) === normaliseNumber(number));
      let action: PreviewRow["action"] = "new";
      let reason: string | null = null;
      if (match) {
        const sameFile = match.versions.some((version) => shaOf.get(version.fileId) === file.sha256 && version.page === page.page);
        const sameRev = !!guess.revision && match.versions.some((version) => version.revision === guess.revision);
        action = sameFile || sameRev ? "skip" : "revise";
        reason = sameFile ? "This exact file is already on the sheet" : sameRev ? `Rev ${guess.revision} is already on the sheet` : null;
      }
      rows.push({
        fileId: file.id,
        fileName: name,
        page: page.page,
        pages: pages.length,
        number,
        title: guess.title,
        revision: guess.revision,
        discipline: guess.discipline || disciplineOf(number),
        action,
        sheetId: match?.id ?? null,
        existing: match ? { number: match.number, title: match.title, revision: match.versions[0]?.revision ?? "" } : null,
        reason,
      });
    }
  }
  return rows;
}

/** Saves the reviewed upload: new sheets, new revisions; then renders them in the background. */
export async function commitImport(ctx: RequestContext, projectId: string, rows: ImportRow[]) {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  const used = rows.filter((row) => row.action !== "skip");
  const files = await myUploads(ctx, [...new Set(rows.map((row) => row.fileId))]);
  const created: string[] = [];
  let newSheets = 0;
  let revisions = 0;

  await db.$transaction(
    async (tx) => {
      // Each upload is filed once, however many pages it has.
      for (const file of files) {
        if (file.blockId) continue;
        if (used.some((row) => row.fileId === file.id)) await attachFile(tx, file.id, { companyId, userId: ctx.userId, blockId: MOD });
      }
      for (const row of used) {
        let sheet = row.action === "revise" && row.sheetId ? await tx.planSheet.findFirst({ where: { id: row.sheetId, companyId, projectId, deletedAt: null } }) : null;
        // Two pages in one upload with the same number: the second is a revision of the first.
        sheet ??= await tx.planSheet.findFirst({ where: { companyId, projectId, deletedAt: null, number: { equals: row.number, mode: "insensitive" } } });
        if (!sheet) {
          sheet = await tx.planSheet.create({
            data: { companyId, projectId, number: row.number, title: row.title, discipline: row.discipline || disciplineOf(row.number), createdById: ctx.userId },
          });
          newSheets++;
        } else {
          revisions++;
          if (row.title && !sheet.title) await tx.planSheet.update({ where: { id: sheet.id }, data: { title: row.title } });
        }
        const planVersion = await tx.planVersion.create({ data: { sheetId: sheet.id, revision: row.revision, fileId: row.fileId, page: row.page, uploadedById: ctx.userId } });
        if (row.makeCurrent || !sheet.currentVersionId) await tx.planSheet.update({ where: { id: sheet.id }, data: { currentVersionId: planVersion.id } });
        created.push(planVersion.id);
      }
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Project", entityId: projectId, action: "plans.uploaded", diff: { newSheets, revisions } });
    },
    { timeout: 60_000 },
  );
  for (const versionId of created) await app().jobs.send("plans.render", { versionId });
  await app().events.emit("plans.uploaded", { projectId, newSheets, revisions }, { emittedBy: MOD, companyId, actorId: ctx.userId });
  return { newSheets, revisions, skipped: rows.length - used.length };
}

// ---------------------------------------------------------------------
// Rendering (background job "plans.render")
// ---------------------------------------------------------------------

export async function renderVersion(versionId: string) {
  const planVersion = await db.planVersion.findUnique({ where: { id: versionId } });
  if (!planVersion) return;
  const file = await db.storedFile.findUnique({ where: { id: planVersion.fileId } });
  if (!file || file.purgedAt) {
    await db.planVersion.update({ where: { id: planVersion.id }, data: { status: "FAILED", error: "The uploaded file is missing" } });
    return;
  }
  try {
    const full = storedFilePath(file);
    let size: { widthPt: number; heightPt: number } | null = null;
    if (file.mime === "application/pdf") {
      const page = (await pdfPages(full)).find((pdfPage) => pdfPage.page === planVersion.page);
      if (!page) throw new Error(`The PDF has no page ${planVersion.page}`);
      size = page;
    }
    const rendered = await renderToTiles({ file: full, mime: file.mime, page: planVersion.page, versionId: planVersion.id, widthPt: size?.widthPt, heightPt: size?.heightPt });
    await db.planVersion.update({
      where: { id: planVersion.id },
      data: { status: "READY", error: null, widthPx: rendered.widthPx, heightPx: rendered.heightPx, dpi: rendered.dpi, pageWidthPt: size?.widthPt ?? null, pageHeightPt: size?.heightPt ?? null },
    });
  } catch (error) {
    console.error(`[plans] couldn't render version ${planVersion.id}`, error);
    await db.planVersion.update({ where: { id: planVersion.id }, data: { status: "FAILED", error: ((error as Error).message || "Couldn't read the file").slice(0, 300) } });
  }
}

export async function retryRender(ctx: RequestContext, versionId: string) {
  const planVersion = await db.planVersion.findUnique({ where: { id: versionId } });
  if (!planVersion) throw notFound();
  await ownSheet(db, ctx, planVersion.sheetId);
  await db.planVersion.update({ where: { id: planVersion.id }, data: { status: "PENDING", error: null } });
  await app().jobs.send("plans.render", { versionId });
  return { id: planVersion.id, status: "PENDING" };
}

// ---------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------

export async function updateSheet(ctx: RequestContext, sheetId: string, input: UpdateSheetInput) {
  return db.$transaction(async (tx) => {
    const sheet = await ownSheet(tx, ctx, sheetId);
    if (input.number && normaliseNumber(input.number) !== normaliseNumber(sheet.number)) {
      const clash = await tx.planSheet.findFirst({ where: { projectId: sheet.projectId, deletedAt: null, id: { not: sheet.id }, number: { equals: input.number, mode: "insensitive" } } });
      if (clash) throw conflict(`There's already a sheet ${clash.number} on this job`);
    }
    const data = { ...input, ...(input.number && input.discipline === undefined && !sheet.discipline ? { discipline: disciplineOf(input.number) } : {}) };
    await tx.planSheet.update({ where: { id: sheet.id }, data });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: sheet.companyId, entityType: "PlanSheet", entityId: sheet.id, action: "updated", diff: input as Prisma.InputJsonValue });
    return { id: sheet.id };
  });
}

export async function setCurrentVersion(ctx: RequestContext, sheetId: string, versionId: string) {
  return db.$transaction(async (tx) => {
    const sheet = await ownSheet(tx, ctx, sheetId);
    const planVersion = await tx.planVersion.findFirst({ where: { id: versionId, sheetId } });
    if (!planVersion) throw notFound("Revision not found");
    await tx.planSheet.update({ where: { id: sheet.id }, data: { currentVersionId: planVersion.id } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: sheet.companyId, entityType: "PlanSheet", entityId: sheet.id, action: "current_changed", diff: { versionId, revision: planVersion.revision } });
    return { id: sheet.id, currentVersionId: planVersion.id };
  });
}

export async function updateVersion(ctx: RequestContext, versionId: string, input: { revision?: string; note?: string | null }) {
  const planVersion = await db.planVersion.findUnique({ where: { id: versionId } });
  if (!planVersion) throw notFound();
  await ownSheet(db, ctx, planVersion.sheetId);
  await db.planVersion.update({ where: { id: versionId }, data: input });
  return { id: versionId };
}

/** Removes a revision uploaded by mistake (not the only one). */
export async function deleteVersion(ctx: RequestContext, versionId: string) {
  const planVersion = await db.planVersion.findUnique({ where: { id: versionId } });
  if (!planVersion) throw notFound();
  const fileId = await db.$transaction(async (tx) => {
    const sheet = await ownSheet(tx, ctx, planVersion.sheetId);
    const others = await tx.planVersion.findMany({ where: { sheetId: sheet.id, id: { not: planVersion.id } }, orderBy: { createdAt: "desc" } });
    if (!others.length) throw conflict("This is the sheet's only revision. Delete the sheet instead.");
    await tx.planVersion.delete({ where: { id: planVersion.id } });
    if (sheet.currentVersionId === planVersion.id) await tx.planSheet.update({ where: { id: sheet.id }, data: { currentVersionId: others[0]!.id } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: sheet.companyId, entityType: "PlanSheet", entityId: sheet.id, action: "revision_removed", diff: { revision: planVersion.revision } });
    const stillUsed = await tx.planVersion.count({ where: { fileId: planVersion.fileId } });
    if (!stillUsed) await tx.storedFile.update({ where: { id: planVersion.fileId }, data: { deletedAt: new Date() } });
    return stillUsed ? null : planVersion.fileId;
  });
  await removeTiles(planVersion.id);
  if (fileId) await db.$transaction((tx) => purgeStoredFile(tx, fileId));
  return { id: versionId, deleted: true };
}

export async function deleteSheet(ctx: RequestContext, sheetId: string) {
  return db.$transaction(async (tx) => {
    const sheet = await ownSheet(tx, ctx, sheetId);
    await tx.planSheet.update({ where: { id: sheet.id }, data: { deletedAt: new Date(), deletedById: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: sheet.companyId, entityType: "PlanSheet", entityId: sheet.id, action: "deleted", diff: { number: sheet.number } });
    return { id: sheet.id, deleted: true };
  });
}

export async function restoreSheet(ctx: RequestContext, sheetId: string) {
  return db.$transaction(async (tx) => {
    const sheet = await ownSheet(tx, ctx, sheetId, { deleted: true });
    if (!sheet.deletedAt) return { id: sheet.id };
    const clash = await tx.planSheet.findFirst({ where: { projectId: sheet.projectId, deletedAt: null, number: { equals: sheet.number, mode: "insensitive" } } });
    if (clash) throw conflict(`There's a sheet ${clash.number} on the job again. Rename one first.`);
    await tx.planSheet.update({ where: { id: sheet.id }, data: { deletedAt: null, deletedById: null } });
    return { id: sheet.id };
  });
}

/** Deleted sheets of a job (for "Recently deleted"). */
export async function deletedSheets(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  return db.planSheet.findMany({ where: { companyId, projectId, deletedAt: { not: null }, purgedAt: null }, orderBy: { deletedAt: "desc" }, select: { id: true, number: true, title: true, deletedAt: true } });
}

// ---------------------------------------------------------------------
// Serving tiles and files
// ---------------------------------------------------------------------

/** Remembers for a minute who may see which version (a view loads dozens of tiles). */
const seen = new Map<string, number>();
async function canSeeVersion(ctx: RequestContext, versionId: string) {
  const key = `${ctx.userId}:${ctx.companyId}:${versionId}`;
  const expiresAt = seen.get(key);
  if (expiresAt && expiresAt > Date.now()) return true;
  const planVersion = await db.planVersion.findUnique({ where: { id: versionId }, select: { sheet: { select: { projectId: true, companyId: true, deletedAt: true } } } });
  if (!planVersion || planVersion.sheet.companyId !== ctx.companyId || !(await canSeeJob(ctx, planVersion.sheet.projectId))) return false;
  if (seen.size > 5000) seen.clear();
  seen.set(key, Date.now() + 60_000);
  return true;
}

const TYPES: Record<string, string> = { ".dzi": "application/xml", ".jpeg": "image/jpeg", ".jpg": "image/jpeg" };

/** A tile, the .dzi description or the thumbnail. Immutable: a version never changes. */
export async function tileResponse(ctx: RequestContext, versionId: string, relativePath: string) {
  if (!(await canSeeVersion(ctx, versionId))) throw notFound();
  if (!/^(plan\.dzi|thumb\.jpg|plan_files\/\d{1,2}\/\d{1,4}_\d{1,4}\.jpeg)$/.test(relativePath)) throw notFound();
  const base = tilesDir(versionId);
  const full = path.join(base, relativePath);
  try {
    const stats = await stat(/*turbopackIgnore: true*/ full);
    return new Response(Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ full)) as ReadableStream, {
      headers: {
        "content-type": TYPES[path.extname(full)] ?? "application/octet-stream",
        "content-length": String(stats.size),
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    throw notFound();
  }
}

/** /api/files asks this before handing over an uploaded plan. */
export async function canReadPlanFile(ctx: RequestContext, fileId: string) {
  if (!ctx.companyId) return false;
  const planVersion = await db.planVersion.findFirst({ where: { fileId, sheet: { companyId: ctx.companyId } }, select: { sheet: { select: { projectId: true } } } });
  return !!planVersion && (await canSeeJob(ctx, planVersion.sheet.projectId));
}

// ---------------------------------------------------------------------
// Storage clean-up: sheets deleted longer ago than Recently deleted keeps them
// ---------------------------------------------------------------------

export async function purgeDeleted(options: { before: Date; dryRun: boolean }): Promise<CleanupItem[]> {
  const sheets = await db.planSheet.findMany({ where: { deletedAt: { lt: options.before }, purgedAt: null }, include: { versions: true }, take: 2000 });
  const items: CleanupItem[] = [];
  for (const sheet of sheets) {
    const fileIds = [...new Set(sheet.versions.map((version) => version.fileId))];
    const files = await db.storedFile.findMany({ where: { id: { in: fileIds }, purgedAt: null } });
    // A PDF with other pages still on live sheets stays.
    const shared = new Set((await db.planVersion.findMany({ where: { fileId: { in: fileIds }, sheet: { id: { not: sheet.id }, purgedAt: null } }, select: { fileId: true } })).map((version) => version.fileId));
    const bytes = files.filter((file) => !shared.has(file.id)).reduce((total, file) => total + storedBytes(file), 0);
    items.push({ companyId: sheet.companyId, kind: "deleted-plan", label: `Plan sheet ${sheet.number}${sheet.title ? ` ${sheet.title}` : ""} (${sheet.versions.length} revision${sheet.versions.length === 1 ? "" : "s"})`, refId: sheet.id, bytes });
    if (options.dryRun) continue;
    for (const version of sheet.versions) await removeTiles(version.id);
    await db.$transaction(async (tx) => {
      for (const file of files) if (!shared.has(file.id)) await purgeStoredFile(tx, file.id);
      await tx.planSheet.update({ where: { id: sheet.id }, data: { purgedAt: new Date() } });
    });
  }
  return items;
}


