// Public service API of the photos block: photos and notes on a job,
// filed against the area (building / level) they're about.
//
// Each record belongs to the company that took it. Others on the job only
// see records marked SHARED (2b); solo businesses never see the choice.

import { HttpError, app, badRequest, conflict, forbidden, notFound, requireCompany, type CleanupItem, type RequestContext } from "@grid/core";
import { attachFile, audit, db, getStorageSettings, purgeDate, purgeStoredFile, recordCleanup, storedBytes, type Prisma } from "@grid/db";
import { canSeeJob, getProject, jobLabelsForSystem, type JobView } from "@grid/block-projects";
import type { AddNoteInput, AddPhotoInput, UpdatePhotoInput } from "./validation";

const MOD = "photos";

async function emit(event: string, payload: unknown, ctx: RequestContext) {
  await app().events.emit(event, payload, { emittedBy: MOD, companyId: ctx.companyId, actorId: ctx.userId });
}

async function jobFor(ctx: RequestContext, projectId: string, write: boolean): Promise<JobView> {
  const job = await getProject(ctx, projectId);
  if (write && job.status === "COMPLETED") throw conflict("This job is finished. Reopen it to add or change photos and notes.");
  return job;
}

/** An area must be on the job: a building it covers, and a level of that building. */
function cleanArea(job: JobView, buildingId?: string | null, levelId?: string | null) {
  if (!buildingId) {
    if (levelId) throw badRequest("Pick the building as well as the level");
    return { buildingId: null, levelId: null };
  }
  if (!job.covers.some((cover) => cover.buildingId === buildingId)) throw badRequest("That building isn't part of this job");
  if (levelId) {
    const building = job.site.buildings.find((building) => building.id === buildingId);
    if (!building?.levels.some((level) => level.id === levelId)) throw badRequest("That level isn't in that building");
  }
  return { buildingId, levelId: levelId ?? null };
}

/** Yours to change: you took it, or you may manage everyone's photos and notes. */
function assertCanChange(ctx: RequestContext, item: { companyId: string; ownerId: string }) {
  if (item.companyId !== ctx.companyId) throw forbidden();
  if (item.ownerId !== ctx.userId && !ctx.permissions.has("photos.manage")) {
    throw forbidden("Only the person who added it, or a Foreman or Owner, can change it");
  }
}

/** Which records of a job this company may see. */
const visibleTo = (companyId: string) => ({ OR: [{ companyId }, { visibility: "SHARED" as const }] });

// ---------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------

export interface PhotoItem {
  kind: "photo";
  id: string;
  fileId: string;
  caption: string | null;
  tag: "NONE" | "BEFORE" | "AFTER";
  at: Date;
  by: string;
  byId: string;
  buildingId: string | null;
  levelId: string | null;
  width: number | null;
  height: number | null;
}

export interface NoteItem {
  kind: "note";
  id: string;
  body: string;
  at: Date;
  edited: boolean;
  by: string;
  byId: string;
  buildingId: string | null;
  levelId: string | null;
}

export type FeedItem = PhotoItem | NoteItem;

/**
 * Photos and notes on a job, newest first. With a level: just that level.
 * With a building only: everything in that building. Neither: the whole job.
 */
export async function feed(
  ctx: RequestContext,
  projectId: string,
  options: { buildingId?: string | null; levelId?: string | null; tag?: "NONE" | "BEFORE" | "AFTER" } = {},
): Promise<{ items: FeedItem[]; counts: { photos: number; before: number; after: number; notes: number } }> {
  const companyId = requireCompany(ctx);
  if (!(await canSeeJob(ctx, projectId))) throw notFound("Job not found");

  const where = {
    projectId,
    deletedAt: null,
    ...visibleTo(companyId),
    ...(options.levelId ? { levelId: options.levelId } : options.buildingId ? { buildingId: options.buildingId } : {}),
  };
  const [photos, notes] = await Promise.all([
    db.jobPhoto.findMany({ where: { ...where, ...(options.tag ? { tag: options.tag } : {}) }, orderBy: { takenAt: "desc" }, take: 500 }),
    options.tag ? Promise.resolve([]) : db.jobNote.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const allPhotos = options.tag ? await db.jobPhoto.findMany({ where, select: { tag: true } }) : photos;

  const files = await db.storedFile.findMany({ where: { id: { in: photos.map((photo) => photo.fileId) } }, select: { id: true, width: true, height: true } });
  const fileDims = new Map(files.map((file) => [file.id, file]));
  const userIds = [...new Set([...photos.map((photo) => photo.takenById), ...notes.map((note) => note.createdById)])];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const name = new Map(users.map((user) => [user.id, user.name]));

  const items: FeedItem[] = [
    ...photos.map(
      (photo): PhotoItem => ({
        kind: "photo",
        id: photo.id,
        fileId: photo.fileId,
        caption: photo.caption,
        tag: photo.tag,
        at: photo.takenAt,
        by: name.get(photo.takenById) ?? "Someone",
        byId: photo.takenById,
        buildingId: photo.buildingId,
        levelId: photo.levelId,
        width: fileDims.get(photo.fileId)?.width ?? null,
        height: fileDims.get(photo.fileId)?.height ?? null,
      }),
    ),
    ...notes.map(
      (note): NoteItem => ({
        kind: "note",
        id: note.id,
        body: note.body,
        at: note.createdAt,
        edited: note.updatedAt.getTime() - note.createdAt.getTime() > 60_000,
        by: name.get(note.createdById) ?? "Someone",
        byId: note.createdById,
        buildingId: note.buildingId,
        levelId: note.levelId,
      }),
    ),
  ].sort((first, second) => second.at.getTime() - first.at.getTime());

  return {
    items,
    counts: {
      photos: allPhotos.length,
      before: allPhotos.filter((photo) => photo.tag === "BEFORE").length,
      after: allPhotos.filter((photo) => photo.tag === "AFTER").length,
      notes: notes.length,
    },
  };
}

// ---------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------

/**
 * Files an uploaded photo against a job. The id comes from the phone, so
 * when a flaky connection makes the phone send it twice, the second call
 * just returns the first.
 */
export async function addPhoto(ctx: RequestContext, input: AddPhotoInput) {
  const companyId = requireCompany(ctx);
  const existing = await db.jobPhoto.findUnique({ where: { id: input.id } });
  if (existing) {
    if (existing.companyId !== companyId || existing.projectId !== input.projectId) throw conflict("That photo id is already used");
    return { id: existing.id, duplicate: true };
  }
  const job = await jobFor(ctx, input.projectId, true);
  const area = cleanArea(job, input.buildingId, input.levelId);
  const takenAt = input.takenAt && input.takenAt.getTime() <= Date.now() + 5 * 60_000 ? input.takenAt : new Date();
  const upload = await db.storedFile.findUnique({ where: { id: input.fileId }, select: { mime: true } });
  if (upload && !upload.mime.startsWith("image/")) throw badRequest("Only photos can go here. Add PDFs to the job's plans.");

  await db.$transaction(async (tx) => {
    try {
      await attachFile(tx, input.fileId, { companyId, userId: ctx.userId, blockId: MOD });
    } catch (error) {
      // The upload has gone (cleaned up after a long time offline). 410 tells
      // the phone to send the photo again from its own copy.
      if ((error as Error).name === "UploadError") {
        throw new HttpError(410, "file_gone", "That upload has expired. Sending the photo again.");
      }
      throw error;
    }
    await tx.jobPhoto.create({
      data: {
        id: input.id,
        projectId: input.projectId,
        companyId,
        ...area,
        fileId: input.fileId,
        caption: input.caption || null,
        tag: input.tag,
        takenAt,
        takenById: ctx.userId,
        ...(input.pin ? { planSheetId: input.pin.sheetId, planX: input.pin.x, planY: input.pin.y } : {}),
      },
    });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      projectId: input.projectId,
      entityType: "JobPhoto",
      entityId: input.id,
      action: "added",
      diff: { ...area, tag: input.tag, pinnedTo: input.pin?.sheetId },
    });
  });
  await emit("photos.added", { projectId: input.projectId, photoId: input.id }, ctx);
  return { id: input.id, duplicate: false };
}

async function ownPhoto(ctx: RequestContext, id: string) {
  const photo = await db.jobPhoto.findFirst({ where: { id, deletedAt: null } });
  if (!photo || photo.companyId !== ctx.companyId) throw notFound("Photo not found");
  assertCanChange(ctx, { companyId: photo.companyId, ownerId: photo.takenById });
  const job = await jobFor(ctx, photo.projectId, true);
  return { photo, job };
}

export async function updatePhoto(ctx: RequestContext, id: string, input: UpdatePhotoInput) {
  const { photo, job } = await ownPhoto(ctx, id);
  const area = input.buildingId !== undefined ? cleanArea(job, input.buildingId, input.levelId) : {};
  const pin = input.pin === undefined ? {} : input.pin ? { planSheetId: input.pin.sheetId, planX: input.pin.x, planY: input.pin.y } : { planSheetId: null, planX: null, planY: null };
  await db.$transaction(async (tx) => {
    await tx.jobPhoto.update({
      where: { id },
      data: { caption: input.caption === undefined ? undefined : input.caption || null, tag: input.tag, ...area, ...pin },
    });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: photo.companyId, projectId: photo.projectId, entityType: "JobPhoto", entityId: id, action: "updated", diff: input as Prisma.InputJsonValue });
  });
  return { id };
}

export async function deletePhoto(ctx: RequestContext, id: string) {
  const { photo } = await ownPhoto(ctx, id);
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.jobPhoto.update({ where: { id }, data: { deletedAt: now, deletedById: ctx.userId } });
    await tx.storedFile.update({ where: { id: photo.fileId }, data: { deletedAt: now } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: photo.companyId, projectId: photo.projectId, entityType: "JobPhoto", entityId: id, action: "deleted" });
  });
  return { id, deleted: true };
}

// ---------------------------------------------------------------------
// Photo pins (4b): photos pinned to a spot on a plan sheet
// ---------------------------------------------------------------------

export interface PinnedPhoto {
  id: string;
  fileId: string;
  x: number;
  y: number;
  caption: string | null;
  tag: "NONE" | "BEFORE" | "AFTER";
  at: Date;
  by: string;
  /** You took it, or you may manage everyone's: you can move or unpin it. */
  canChange: boolean;
}

/**
 * Photos pinned to a plan sheet. The Plans viewer passes the sheet and its
 * job; only photos of that job show, so a wrong sheet id finds nothing.
 */
export async function pinsForSheet(ctx: RequestContext, projectId: string, sheetId: string): Promise<PinnedPhoto[]> {
  const companyId = requireCompany(ctx);
  if (!(await canSeeJob(ctx, projectId))) throw notFound("Job not found");
  const photos = await db.jobPhoto.findMany({
    where: { projectId, planSheetId: sheetId, deletedAt: null, ...visibleTo(companyId) },
    orderBy: { takenAt: "asc" },
    take: 2000,
  });
  const name = await userNames(photos.map((photo) => photo.takenById));
  return photos.map((photo) => ({
    id: photo.id,
    fileId: photo.fileId,
    x: photo.planX ?? 0,
    y: photo.planY ?? 0,
    caption: photo.caption,
    tag: photo.tag,
    at: photo.takenAt,
    by: name.get(photo.takenById) ?? "Someone",
    canChange: photo.companyId === companyId && (photo.takenById === ctx.userId || ctx.permissions.has("photos.manage")),
  }));
}

/** /api/files asks this before handing over a photo. */
export async function canReadPhotoFile(ctx: RequestContext, fileId: string): Promise<boolean> {
  const photo = await db.jobPhoto.findUnique({ where: { fileId } });
  if (!photo || photo.deletedAt) return false;
  if (photo.companyId !== ctx.companyId && photo.visibility !== "SHARED") return false;
  return ctx.permissions.has("photos.view") && canSeeJob(ctx, photo.projectId);
}

// ---------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------

export async function addNote(ctx: RequestContext, input: AddNoteInput) {
  const companyId = requireCompany(ctx);
  const job = await jobFor(ctx, input.projectId, true);
  const area = cleanArea(job, input.buildingId, input.levelId);
  const note = await db.$transaction(async (tx) => {
    const note = await tx.jobNote.create({ data: { projectId: input.projectId, companyId, ...area, body: input.body, createdById: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId: input.projectId, entityType: "JobNote", entityId: note.id, action: "added" });
    return note;
  });
  return { id: note.id };
}

async function ownNote(ctx: RequestContext, id: string) {
  const note = await db.jobNote.findFirst({ where: { id, deletedAt: null } });
  if (!note || note.companyId !== ctx.companyId) throw notFound("Note not found");
  assertCanChange(ctx, { companyId: note.companyId, ownerId: note.createdById });
  await jobFor(ctx, note.projectId, true);
  return note;
}

export async function updateNote(ctx: RequestContext, id: string, body: string) {
  const note = await ownNote(ctx, id);
  await db.$transaction(async (tx) => {
    await tx.jobNote.update({ where: { id }, data: { body } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: note.companyId, projectId: note.projectId, entityType: "JobNote", entityId: id, action: "updated", diff: { before: note.body } });
  });
  return { id };
}

export async function deleteNote(ctx: RequestContext, id: string) {
  const note = await ownNote(ctx, id);
  await db.$transaction(async (tx) => {
    await tx.jobNote.update({ where: { id }, data: { deletedAt: new Date(), deletedById: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: note.companyId, projectId: note.projectId, entityType: "JobNote", entityId: id, action: "deleted" });
  });
  return { id, deleted: true };
}

// ---------------------------------------------------------------------
// Recently deleted (Settings › Storage), restore, Delete now, purge
// ---------------------------------------------------------------------

const day = (date: Date) => date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export interface DeletedRow {
  kind: "photo" | "note";
  id: string;
  /** Photo: its file, for the thumbnail. */
  fileId: string | null;
  /** Note: the start of its text. */
  text: string | null;
  job: string;
  projectId: string;
  addedBy: string;
  deletedBy: string;
  deletedAt: Date;
  /** When it goes for good. */
  purgeAt: Date;
  bytes: number;
}

async function userNames(ids: (string | null | undefined)[]) {
  const users = await db.user.findMany({ where: { id: { in: [...new Set(ids.filter(Boolean) as string[])] } }, select: { id: true, name: true } });
  return new Map(users.map((user) => [user.id, user.name]));
}

/** This company's Recently deleted photos and notes, soonest-to-go first. */
export async function listDeleted(ctx: RequestContext): Promise<DeletedRow[]> {
  const companyId = requireCompany(ctx);
  const { deletedDays } = await getStorageSettings();
  const where = { companyId, deletedAt: { not: null }, purgedAt: null };
  const [photos, notes] = await Promise.all([
    db.jobPhoto.findMany({ where, orderBy: { deletedAt: "asc" }, take: 1000 }),
    db.jobNote.findMany({ where, orderBy: { deletedAt: "asc" }, take: 1000 }),
  ]);
  const files = await db.storedFile.findMany({ where: { id: { in: photos.map((photo) => photo.fileId) } }, select: { id: true, size: true, variants: true } });
  const bytes = new Map(files.map((file) => [file.id, storedBytes(file)]));
  const jobs = await jobLabelsForSystem([...photos, ...notes].map((entry) => entry.projectId));
  const names = await userNames([...photos.flatMap((photo) => [photo.takenById, photo.deletedById]), ...notes.flatMap((note) => [note.createdById, note.deletedById])]);
  const rows: DeletedRow[] = [
    ...photos.map((photo) => ({
      kind: "photo" as const,
      id: photo.id,
      fileId: photo.fileId,
      text: photo.caption,
      job: jobs.get(photo.projectId) ?? "A job",
      projectId: photo.projectId,
      addedBy: names.get(photo.takenById) ?? "Someone",
      deletedBy: names.get(photo.deletedById ?? "") ?? "Someone",
      deletedAt: photo.deletedAt!,
      purgeAt: purgeDate(photo.deletedAt!, deletedDays),
      bytes: bytes.get(photo.fileId) ?? 0,
    })),
    ...notes.map((note) => ({
      kind: "note" as const,
      id: note.id,
      fileId: null,
      text: note.body.slice(0, 200),
      job: jobs.get(note.projectId) ?? "A job",
      projectId: note.projectId,
      addedBy: names.get(note.createdById) ?? "Someone",
      deletedBy: names.get(note.deletedById ?? "") ?? "Someone",
      deletedAt: note.deletedAt!,
      purgeAt: purgeDate(note.deletedAt!, deletedDays),
      bytes: 0,
    })),
  ];
  return rows.sort((first, second) => first.deletedAt.getTime() - second.deletedAt.getTime());
}

/** Puts a deleted photo or note back where it was. */
export async function restore(ctx: RequestContext, kind: "photo" | "note", id: string) {
  const companyId = requireCompany(ctx);
  const row = kind === "photo" ? await db.jobPhoto.findUnique({ where: { id } }) : await db.jobNote.findUnique({ where: { id } });
  if (!row || row.companyId !== companyId || !row.deletedAt) throw notFound("Not in Recently deleted");
  if (row.purgedAt) throw conflict("That's already been removed for good");
  await db.$transaction(async (tx) => {
    const data = { deletedAt: null, deletedById: null, restoredAt: new Date(), restoredById: ctx.userId };
    if (kind === "photo") {
      await tx.jobPhoto.update({ where: { id }, data });
      await tx.storedFile.update({ where: { id: (row as { fileId: string }).fileId }, data: { deletedAt: null } });
    } else {
      await tx.jobNote.update({ where: { id }, data });
    }
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId: row.projectId, entityType: kind === "photo" ? "JobPhoto" : "JobNote", entityId: id, action: "restored" });
  });
  return { id, restored: true };
}

function labelFor(kind: "photo" | "note", job: string, deletedBy: string, deletedAt: Date, caption?: string | null) {
  const what = kind === "photo" ? (caption ? `Photo "${caption.slice(0, 60)}"` : "Photo") : "Note";
  return `${what} on ${job}, deleted by ${deletedBy} on ${day(deletedAt)}`;
}

/** Removes deleted photos/notes for good, now. Shared by Delete now and the nightly purge. */
async function purge(
  photos: Prisma.JobPhotoGetPayload<object>[],
  notes: Prisma.JobNoteGetPayload<object>[],
  dryRun: boolean,
): Promise<CleanupItem[]> {
  const jobs = await jobLabelsForSystem([...photos, ...notes].map((entry) => entry.projectId));
  const names = await userNames([...photos, ...notes].map((entry) => entry.deletedById));
  const items: CleanupItem[] = [];
  for (const photo of photos) {
    const file = await db.storedFile.findUnique({ where: { id: photo.fileId }, select: { size: true, variants: true } });
    const label = labelFor("photo", jobs.get(photo.projectId) ?? "a job", names.get(photo.deletedById ?? "") ?? "someone", photo.deletedAt!, photo.caption);
    let bytes = file ? storedBytes(file) : 0;
    if (!dryRun) {
      bytes = await db.$transaction(async (tx) => {
        const freed = await purgeStoredFile(tx, photo.fileId);
        await tx.jobPhoto.update({ where: { id: photo.id }, data: { purgedAt: new Date() } });
        return freed;
      });
    }
    items.push({ companyId: photo.companyId, kind: "deleted-photo", label, refId: photo.id, bytes });
  }
  for (const note of notes) {
    const label = labelFor("note", jobs.get(note.projectId) ?? "a job", names.get(note.deletedById ?? "") ?? "someone", note.deletedAt!);
    if (!dryRun) await db.jobNote.update({ where: { id: note.id }, data: { purgedAt: new Date() } });
    items.push({ companyId: note.companyId, kind: "deleted-note", label, refId: note.id, bytes: 0 });
  }
  return items;
}

/** A manager's "Delete now" in Recently deleted: gone for good, before the 30 days are up. */
export async function deleteNow(ctx: RequestContext, input: { photoIds: string[]; noteIds: string[] }) {
  const companyId = requireCompany(ctx);
  const where = { companyId, deletedAt: { not: null }, purgedAt: null };
  const [photos, notes] = await Promise.all([
    db.jobPhoto.findMany({ where: { ...where, id: { in: input.photoIds } } }),
    db.jobNote.findMany({ where: { ...where, id: { in: input.noteIds } } }),
  ]);
  const items = await purge(photos, notes, false);
  if (items.length) await recordCleanup({ trigger: "delete-now", mode: "on", userId: ctx.userId, items });
  return { removed: items.length, bytes: items.reduce((total, item) => total + item.bytes, 0) };
}

/** The nightly clean-up: everything whose Recently deleted time is up, across all companies. */
export async function purgeDeleted(options: { before: Date; dryRun: boolean }): Promise<CleanupItem[]> {
  const where = { deletedAt: { lt: options.before }, purgedAt: null };
  const [photos, notes] = await Promise.all([
    db.jobPhoto.findMany({ where, take: 5000 }),
    db.jobNote.findMany({ where, take: 5000 }),
  ]);
  return purge(photos, notes, options.dryRun);
}
