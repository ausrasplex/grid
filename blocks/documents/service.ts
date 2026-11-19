// Documents block service (phase 5b, docs/documents-block.md).
// Library documents belong to the business (Manuals, Data sheets…); job
// documents belong to one job and sit in its folders. Library documents
// can also be pinned to a job (DocumentLink). Every upload of a document
// is a DocumentVersion; PDFs are rendered to page pictures in the
// background ("documents.render") for the viewer.

import "server-only";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { app, badRequest, can, conflict, notFound, requireCompany, type RequestContext } from "@grid/core";
import { attachFile, audit, db, folderBytes, purgeStoredFile, storedFilePath, type Prisma, type Tx } from "@grid/db";
import { canSeeJob, getProject, isJobArchived, myActiveJobs } from "@grid/block-projects";
import { assertNotArchived, openOnArchivedJob } from "./archive";
import { documentKind, titleFromFileName, type DocumentKind } from "./kinds";
import { pagesDir, removePages, renderPdfPages, sheetFile, writeSheets } from "./render";
import { extractText, findInVersion } from "./text";
import { addColumns, readWorkbook, summarise, type AddedColumns, type SheetData, type SheetSummary } from "./sheets";
import type { AddDocumentsInput, LibraryInput, UpdateDocumentInput } from "./validation";

const MOD = "documents";

/** A new business's libraries, and the folders a new job starts with (until changed in settings). */
export const STARTER_LIBRARIES = ["Manuals", "Data sheets", "Certificates", "Procedures"];
export const STARTER_JOB_FOLDERS = ["Fit-off", "Points lists", "Schedules", "Certificates"];

// ---------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------

async function ownDocument(tx: Tx, ctx: RequestContext, documentId: string, options: { deleted?: boolean } = {}) {
  const companyId = requireCompany(ctx);
  const document = await tx.libraryDocument.findFirst({
    where: { id: documentId, companyId, purgedAt: null, ...(options.deleted ? {} : { deletedAt: null }) },
  });
  if (!document) throw notFound("Document not found");
  if (document.projectId && !(await canSeeJob(ctx, document.projectId))) throw notFound("Document not found");
  return document;
}

async function jobOrThrow(ctx: RequestContext, projectId: string) {
  if (!(await canSeeJob(ctx, projectId))) throw notFound("Job not found");
}

async function ownLibrary(tx: Tx, companyId: string, libraryId: string) {
  const library = await tx.documentLibrary.findFirst({ where: { id: libraryId, companyId, deletedAt: null } });
  if (!library) throw notFound("Library not found");
  return library;
}

async function ownFolder(tx: Tx, companyId: string, projectId: string, folderId: string) {
  const folder = await tx.jobDocumentFolder.findFirst({ where: { id: folderId, companyId, projectId, deletedAt: null } });
  if (!folder) throw notFound("Folder not found");
  return folder;
}

// ---------------------------------------------------------------------
// Libraries and settings
// ---------------------------------------------------------------------

/** A business gets the starter libraries the first time anyone opens Documents. */
async function ensureLibraries(companyId: string) {
  if (await db.documentLibrary.count({ where: { companyId } })) return;
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`documents:libraries:${companyId}`}))`;
    if (await tx.documentLibrary.count({ where: { companyId } })) return;
    await tx.documentLibrary.createMany({ data: STARTER_LIBRARIES.map((name, sort) => ({ companyId, name, sort })) });
  });
}

export async function listLibraries(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  await ensureLibraries(companyId);
  const [libraries, counts] = await Promise.all([
    db.documentLibrary.findMany({ where: { companyId, deletedAt: null }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    db.libraryDocument.groupBy({ by: ["libraryId"], where: { companyId, libraryId: { not: null }, deletedAt: null }, _count: { _all: true } }),
  ]);
  const countOf = new Map(counts.map((row) => [row.libraryId, row._count._all]));
  return libraries.map((library) => ({
    id: library.id,
    name: library.name,
    isFinancial: library.isFinancial,
    allowDownload: library.allowDownload,
    availableOffline: library.availableOffline,
    count: countOf.get(library.id) ?? 0,
  }));
}

export type LibraryRow = Awaited<ReturnType<typeof listLibraries>>[number];

export async function saveLibrary(ctx: RequestContext, libraryId: string | null, input: LibraryInput) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const clash = await tx.documentLibrary.findFirst({
      where: { companyId, deletedAt: null, name: { equals: input.name, mode: "insensitive" }, ...(libraryId ? { id: { not: libraryId } } : {}) },
    });
    if (clash) throw conflict(`There's already a library called ${clash.name}`);
    let id = libraryId;
    if (libraryId) {
      await ownLibrary(tx, companyId, libraryId);
      await tx.documentLibrary.update({ where: { id: libraryId }, data: input });
    } else {
      const last = await tx.documentLibrary.aggregate({ where: { companyId, deletedAt: null }, _max: { sort: true } });
      id = (await tx.documentLibrary.create({ data: { ...input, companyId, sort: (last._max.sort ?? -1) + 1 } })).id;
    }
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "DocumentLibrary", entityId: id!, action: libraryId ? "updated" : "created", diff: input as Prisma.InputJsonValue });
    return { id: id! };
  });
}

/** Only an empty library can go (its documents are moved or deleted first). */
export async function deleteLibrary(ctx: RequestContext, libraryId: string) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const library = await ownLibrary(tx, companyId, libraryId);
    const inside = await tx.libraryDocument.count({ where: { libraryId, deletedAt: null } });
    if (inside) throw conflict(`${library.name} still has ${inside} document${inside === 1 ? "" : "s"}. Move or delete ${inside === 1 ? "it" : "them"} first.`);
    await tx.documentLibrary.update({ where: { id: libraryId }, data: { deletedAt: new Date() } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "DocumentLibrary", entityId: libraryId, action: "deleted", diff: { name: library.name } });
    return { id: libraryId, deleted: true };
  });
}

export async function getSettings(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const settings = await db.documentSettings.findUnique({ where: { companyId } });
  return { jobFolders: settings ? settings.jobFolders : STARTER_JOB_FOLDERS };
}

export async function updateSettings(ctx: RequestContext, input: { jobFolders: string[] }) {
  const companyId = requireCompany(ctx);
  const jobFolders = [...new Map(input.jobFolders.map((name) => [name.toLowerCase(), name])).values()];
  return db.$transaction(async (tx) => {
    await tx.documentSettings.upsert({ where: { companyId }, create: { companyId, jobFolders }, update: { jobFolders } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "DocumentSettings", entityId: companyId, action: "updated", diff: { jobFolders } });
    return { jobFolders };
  });
}

// ---------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------

const withCurrent = { versions: { orderBy: { createdAt: "desc" as const } } } satisfies Prisma.LibraryDocumentInclude;
type DocumentWithVersions = Prisma.LibraryDocumentGetPayload<{ include: typeof withCurrent }>;

async function filesOf(fileIds: string[]) {
  const files = await db.storedFile.findMany({ where: { id: { in: fileIds } }, select: { id: true, mime: true, size: true, originalName: true } });
  return new Map(files.map((file) => [file.id, file]));
}

function rowOf(document: DocumentWithVersions, files: Map<string, { mime: string; size: number; originalName: string | null }>, names: { libraries?: Map<string, string> } = {}) {
  const current = document.versions.find((version) => version.id === document.currentVersionId) ?? document.versions[0] ?? null;
  const file = current ? files.get(current.fileId) : undefined;
  const kind: DocumentKind = file ? documentKind(file.mime) : "other";
  return {
    id: document.id,
    title: document.title,
    libraryId: document.libraryId,
    libraryName: document.libraryId ? (names.libraries?.get(document.libraryId) ?? null) : null,
    projectId: document.projectId,
    folderId: document.folderId,
    manufacturer: document.manufacturer,
    models: document.models,
    tags: document.tags,
    kind,
    pages: current?.pages ?? 0,
    status: current?.status ?? "FAILED",
    versions: document.versions.length,
    /** For the little picture: a rendered first page, or the photo itself. */
    thumb: !current ? null : kind === "pdf" ? (current.status === "READY" ? `/api/documents/pages/${current.id}/thumb.jpg` : null) : kind === "image" ? `/api/files/${current.fileId}?v=thumb` : null,
    updatedAt: current?.createdAt ?? document.createdAt,
  };
}

export type DocumentRow = ReturnType<typeof rowOf>;

async function rowsOf(documents: DocumentWithVersions[], companyId: string) {
  const files = await filesOf(documents.flatMap((document) => document.versions.map((version) => version.fileId)));
  const libraries = new Map((await db.documentLibrary.findMany({ where: { companyId }, select: { id: true, name: true } })).map((library) => [library.id, library.name]));
  return documents.map((document) => rowOf(document, files, { libraries }));
}

/** Library documents, newest first (all libraries, or one). */
export async function listLibraryDocuments(ctx: RequestContext, libraryId: string | null) {
  const companyId = requireCompany(ctx);
  await ensureLibraries(companyId);
  if (libraryId) await ownLibrary(db, companyId, libraryId);
  const documents = await db.libraryDocument.findMany({
    where: { companyId, deletedAt: null, ...(libraryId ? { libraryId } : { libraryId: { not: null }, library: { deletedAt: null } }) },
    include: withCurrent,
    orderBy: { updatedAt: "desc" },
    take: 2000,
  });
  return rowsOf(documents, companyId);
}

/** A job starts with the business's folders the first time its Documents are opened. */
async function ensureFolders(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  if (await db.jobDocumentFolder.count({ where: { companyId, projectId } })) return;
  const { jobFolders } = await getSettings(ctx);
  if (!jobFolders.length) return;
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`documents:folders:${projectId}`}))`;
    if (await tx.jobDocumentFolder.count({ where: { companyId, projectId } })) return;
    await tx.jobDocumentFolder.createMany({ data: jobFolders.map((name, sort) => ({ companyId, projectId, name, sort })) });
  });
}

/** A job's folders, its own documents, and the library documents pinned to it. */
export async function jobDocuments(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  await ensureFolders(ctx, projectId);
  const [folders, documents, links] = await Promise.all([
    db.jobDocumentFolder.findMany({ where: { companyId, projectId, deletedAt: null }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    db.libraryDocument.findMany({ where: { companyId, projectId, deletedAt: null }, include: withCurrent, orderBy: { title: "asc" } }),
    db.documentLink.findMany({ where: { companyId, projectId, document: { deletedAt: null } }, include: { document: { include: withCurrent } }, orderBy: { createdAt: "asc" } }),
  ]);
  const rows = await rowsOf([...documents, ...links.map((link) => link.document)], companyId);
  return {
    folders: folders.map((folder) => ({ id: folder.id, name: folder.name })),
    documents: rows.slice(0, documents.length),
    links: links.map((link, index) => ({ id: link.id, folderId: link.folderId, document: rows[documents.length + index]! })),
  };
}

export type JobDocuments = Awaited<ReturnType<typeof jobDocuments>>;

/** For the job page: how many documents, and the latest few. */
export async function documentsForJobPanel(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  const [own, linked, recent] = await Promise.all([
    db.libraryDocument.count({ where: { companyId, projectId, deletedAt: null } }),
    db.documentLink.count({ where: { companyId, projectId, document: { deletedAt: null } } }),
    db.libraryDocument.findMany({ where: { companyId, projectId, deletedAt: null }, include: withCurrent, orderBy: { updatedAt: "desc" }, take: 3 }),
  ]);
  return { total: own + linked, recent: await rowsOf(recent, companyId) };
}

// ---------------------------------------------------------------------
// Job folders
// ---------------------------------------------------------------------

export async function addFolder(ctx: RequestContext, projectId: string, name: string) {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  return db.$transaction(async (tx) => {
    const clash = await tx.jobDocumentFolder.findFirst({ where: { companyId, projectId, deletedAt: null, name: { equals: name, mode: "insensitive" } } });
    if (clash) throw conflict(`There's already a ${clash.name} folder`);
    const last = await tx.jobDocumentFolder.aggregate({ where: { companyId, projectId, deletedAt: null }, _max: { sort: true } });
    const folder = await tx.jobDocumentFolder.create({ data: { companyId, projectId, name, sort: (last._max.sort ?? -1) + 1 } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "JobDocumentFolder", entityId: folder.id, action: "created", diff: { name, projectId } });
    return { id: folder.id, name: folder.name };
  });
}

export async function renameFolder(ctx: RequestContext, folderId: string, name: string) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const folder = await tx.jobDocumentFolder.findFirst({ where: { id: folderId, companyId, deletedAt: null } });
    if (!folder) throw notFound("Folder not found");
    await jobOrThrow(ctx, folder.projectId);
    const clash = await tx.jobDocumentFolder.findFirst({ where: { companyId, projectId: folder.projectId, deletedAt: null, id: { not: folderId }, name: { equals: name, mode: "insensitive" } } });
    if (clash) throw conflict(`There's already a ${clash.name} folder`);
    await tx.jobDocumentFolder.update({ where: { id: folderId }, data: { name } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "JobDocumentFolder", entityId: folderId, action: "renamed", diff: { from: folder.name, to: name } });
    return { id: folderId, name };
  });
}

/** Removes a folder; anything in it moves out to the top of the job's documents. */
export async function deleteFolder(ctx: RequestContext, folderId: string) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const folder = await tx.jobDocumentFolder.findFirst({ where: { id: folderId, companyId, deletedAt: null } });
    if (!folder) throw notFound("Folder not found");
    await jobOrThrow(ctx, folder.projectId);
    const moved = await tx.libraryDocument.updateMany({ where: { folderId }, data: { folderId: null } });
    await tx.documentLink.updateMany({ where: { folderId }, data: { folderId: null } });
    await tx.jobDocumentFolder.update({ where: { id: folderId }, data: { deletedAt: new Date() } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "JobDocumentFolder", entityId: folderId, action: "deleted", diff: { name: folder.name, moved: moved.count } });
    return { id: folderId, deleted: true };
  });
}

// ---------------------------------------------------------------------
// Adding documents and versions
// ---------------------------------------------------------------------

async function myUploads(tx: Tx, ctx: RequestContext, fileIds: string[]) {
  const companyId = requireCompany(ctx);
  const files = await tx.storedFile.findMany({ where: { id: { in: fileIds }, companyId, deletedAt: null } });
  for (const id of fileIds) {
    const file = files.find((candidate) => candidate.id === id);
    if (!file) throw badRequest("One of the uploads has gone. Upload it again.");
    if (file.blockId) throw badRequest(`${file.originalName ?? "A file"} is already used elsewhere.`);
    if (file.createdById !== ctx.userId) throw badRequest("One of the uploads isn't yours.");
  }
  return fileIds.map((id) => files.find((file) => file.id === id)!);
}

/** PDFs (pages) and spreadsheets (sheets) are prepared for the viewer in the background. */
const needsRender = (mime: string) => ["pdf", "spreadsheet"].includes(documentKind(mime));

/** A new version starts PENDING when it needs preparing for the viewer, otherwise it's ready now. */
const versionStart = (mime: string) =>
  needsRender(mime) ? { status: "PENDING" as const, pages: 0 } : { status: "READY" as const, pages: documentKind(mime) === "image" ? 1 : 0 };

/**
 * Files uploaded to a library or a job become documents, titled from their
 * file names. The same file already in that library or job is skipped and
 * listed (unless allowDuplicates), so it can be added anyway.
 */
export async function addDocuments(ctx: RequestContext, input: AddDocumentsInput) {
  const companyId = requireCompany(ctx);
  const library = input.libraryId ? await ownLibrary(db, companyId, input.libraryId) : null;
  if (input.projectId) {
    await jobOrThrow(ctx, input.projectId);
    await assertNotArchived(input.projectId);
    if (input.folderId) await ownFolder(db, companyId, input.projectId, input.folderId);
  }
  const fileIds = [...new Set(input.fileIds)];
  const toRender: string[] = [];
  const added: { id: string; title: string }[] = [];
  const duplicates: { fileId: string; fileName: string; title: string }[] = [];

  await db.$transaction(
    async (tx) => {
      const files = await myUploads(tx, ctx, fileIds);
      // The same bytes already in this library or job.
      const twins = input.allowDuplicates
        ? []
        : await tx.storedFile.findMany({ where: { companyId, blockId: MOD, purgedAt: null, sha256: { in: files.map((file) => file.sha256) } }, select: { id: true, sha256: true } });
      const twinVersions = twins.length
        ? await tx.documentVersion.findMany({
            where: { fileId: { in: twins.map((twin) => twin.id) }, document: { deletedAt: null, ...(library ? { libraryId: library.id } : { projectId: input.projectId }) } },
            select: { fileId: true, document: { select: { title: true } } },
          })
        : [];
      for (const file of files) {
        const twin = twinVersions.find((version) => twins.find((candidate) => candidate.id === version.fileId)?.sha256 === file.sha256);
        if (twin) {
          duplicates.push({ fileId: file.id, fileName: file.originalName ?? "A file", title: twin.document.title });
          continue;
        }
        await attachFile(tx, file.id, { companyId, userId: ctx.userId, blockId: MOD });
        const document = await tx.libraryDocument.create({
          data: {
            companyId,
            libraryId: library?.id ?? null,
            projectId: library ? null : input.projectId,
            folderId: library ? null : input.folderId,
            title: titleFromFileName(file.originalName),
            allowDownload: library?.allowDownload ?? true,
            availableOffline: library?.availableOffline ?? false,
            createdById: ctx.userId,
          },
        });
        const version = await tx.documentVersion.create({ data: { documentId: document.id, fileId: file.id, uploadedById: ctx.userId, ...versionStart(file.mime) } });
        await tx.libraryDocument.update({ where: { id: document.id }, data: { currentVersionId: version.id } });
        if (needsRender(file.mime)) toRender.push(version.id);
        added.push({ id: document.id, title: document.title });
        await audit(tx, {
          blockId: MOD,
          actorId: ctx.userId,
          companyId,
          entityType: "LibraryDocument",
          entityId: document.id,
          action: "added",
          diff: { title: document.title, ...(library ? { library: library.name } : { projectId: input.projectId }) },
        });
      }
    },
    { timeout: 60_000 },
  );
  for (const versionId of toRender) await app().jobs.send("documents.render", { versionId });
  if (added.length) await app().events.emit("documents.added", { count: added.length, libraryId: input.libraryId, projectId: input.projectId }, { emittedBy: MOD, companyId, actorId: ctx.userId });
  return { added, duplicates };
}

/** Uploads a new version; it becomes current. */
export async function addVersion(ctx: RequestContext, documentId: string, input: { fileId: string; note: string | null }) {
  const companyId = requireCompany(ctx);
  const result = await db.$transaction(async (tx) => {
    const document = await ownDocument(tx, ctx, documentId);
    if (document.projectId) await assertNotArchived(document.projectId);
    const [file] = await myUploads(tx, ctx, [input.fileId]);
    await attachFile(tx, file!.id, { companyId, userId: ctx.userId, blockId: MOD });
    const version = await tx.documentVersion.create({ data: { documentId, fileId: file!.id, note: input.note, uploadedById: ctx.userId, ...versionStart(file!.mime) } });
    await tx.libraryDocument.update({ where: { id: documentId }, data: { currentVersionId: version.id } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "LibraryDocument", entityId: documentId, action: "new_version", diff: { title: document.title, fileName: file!.originalName } });
    return { versionId: version.id, render: needsRender(file!.mime) };
  });
  if (result.render) await app().jobs.send("documents.render", { versionId: result.versionId });
  await app().events.emit("documents.versioned", { documentId }, { emittedBy: MOD, companyId, actorId: ctx.userId });
  return { id: documentId, versionId: result.versionId };
}

// ---------------------------------------------------------------------
// One document
// ---------------------------------------------------------------------

/**
 * One document. `openVersionId` is the version on screen (else the current
 * one): on an archived job it's made again if its copies were dropped (phase 2e).
 */
export async function getDocument(ctx: RequestContext, documentId: string, openVersionId?: string | null) {
  const document = await ownDocument(db, ctx, documentId);
  const archived = !!document.projectId && (await isJobArchived(document.projectId));
  if (archived) {
    const shown = openVersionId ?? document.currentVersionId;
    const version = shown ? await db.documentVersion.findFirst({ where: { id: shown, documentId }, select: { id: true } }) : null;
    if (version) await openOnArchivedJob(version.id);
  }
  const versions = await db.documentVersion.findMany({ where: { documentId }, orderBy: { createdAt: "desc" } });
  const files = await filesOf(versions.map((version) => version.fileId));
  // Spreadsheets uploaded before the spreadsheet viewer: prepare them now.
  for (const version of versions) {
    if (version.status !== "READY" || version.sheets != null || documentKind(files.get(version.fileId)?.mime ?? "") !== "spreadsheet") continue;
    await db.documentVersion.update({ where: { id: version.id }, data: { status: "PENDING" } });
    version.status = "PENDING";
    await app().jobs.send("documents.render", { versionId: version.id });
  }
  const names = new Map((await db.user.findMany({ where: { id: { in: versions.map((version) => version.uploadedById) } }, select: { id: true, name: true } })).map((user) => [user.id, user.name]));
  const library = document.libraryId ? await db.documentLibrary.findUnique({ where: { id: document.libraryId }, select: { id: true, name: true } }) : null;
  const job = document.projectId ? await getProject(ctx, document.projectId) : null;
  const folder = document.folderId ? await db.jobDocumentFolder.findFirst({ where: { id: document.folderId, deletedAt: null }, select: { id: true, name: true } }) : null;
  // Jobs it's pinned to (only the ones this person can see).
  const links = [];
  for (const link of await db.documentLink.findMany({ where: { documentId }, orderBy: { createdAt: "asc" } })) {
    if (!(await canSeeJob(ctx, link.projectId))) continue;
    const linkedJob = await getProject(ctx, link.projectId).catch(() => null);
    if (linkedJob) links.push({ id: link.id, projectId: link.projectId, jobName: linkedJob.name });
  }
  const currentVersionId = document.currentVersionId ?? versions[0]?.id ?? null;
  return {
    id: document.id,
    title: document.title,
    description: document.description,
    manufacturer: document.manufacturer,
    models: document.models,
    productType: document.productType,
    tags: document.tags,
    allowDownload: document.allowDownload,
    availableOffline: document.availableOffline,
    library,
    job: job ? { id: job.id, name: job.name } : null,
    folder,
    links,
    /** On an archived job: copies are made again for a quick look when opened. */
    archived,
    currentVersionId,
    versions: versions.map((version) => {
      const file = files.get(version.fileId);
      return {
        id: version.id,
        status: version.status,
        /** Archived job: the page pictures or sheet data were dropped. */
        dropped: !!version.copiesDroppedAt,
        error: version.error,
        pages: version.pages,
        pageSizes: (version.pageSizes ?? []) as [number, number][],
        sheets: (version.sheets ?? []) as unknown as SheetSummary[],
        fileId: version.fileId,
        fileName: file?.originalName ?? null,
        kind: documentKind(file?.mime ?? ""),
        size: file?.size ?? 0,
        note: version.note,
        createdAt: version.createdAt,
        uploadedBy: names.get(version.uploadedById) ?? "Someone",
      };
    }),
  };
}

export type DocumentView = Awaited<ReturnType<typeof getDocument>>;

export async function updateDocument(ctx: RequestContext, documentId: string, input: UpdateDocumentInput) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const document = await ownDocument(tx, ctx, documentId);
    if (input.libraryId !== undefined) {
      if (!document.libraryId) throw badRequest("A job's documents stay on the job. Pin a library document to a job instead.");
      await ownLibrary(tx, companyId, input.libraryId);
    }
    if (input.folderId !== undefined && input.folderId !== null) {
      if (!document.projectId) throw badRequest("Library documents don't go in job folders");
      await ownFolder(tx, companyId, document.projectId, input.folderId);
    }
    const tidy = (list?: string[]) => (list ? [...new Set(list.map((word) => word.trim()).filter(Boolean))] : undefined);
    await tx.libraryDocument.update({ where: { id: documentId }, data: { ...input, models: tidy(input.models), tags: tidy(input.tags) } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "LibraryDocument", entityId: documentId, action: "updated", diff: input as Prisma.InputJsonValue });
    return { id: documentId };
  });
}

export async function setCurrentVersion(ctx: RequestContext, documentId: string, versionId: string) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const document = await ownDocument(tx, ctx, documentId);
    const version = await tx.documentVersion.findFirst({ where: { id: versionId, documentId } });
    if (!version) throw notFound("Version not found");
    await tx.libraryDocument.update({ where: { id: documentId }, data: { currentVersionId: versionId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "LibraryDocument", entityId: documentId, action: "current_changed", diff: { title: document.title, versionId } });
    return { id: documentId, currentVersionId: versionId };
  });
}

export async function updateVersionNote(ctx: RequestContext, versionId: string, note: string | null) {
  const version = await db.documentVersion.findUnique({ where: { id: versionId } });
  if (!version) throw notFound("Version not found");
  return db.$transaction(async (tx) => {
    const document = await ownDocument(tx, ctx, version.documentId);
    await tx.documentVersion.update({ where: { id: versionId }, data: { note } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: document.companyId, entityType: "LibraryDocument", entityId: document.id, action: "version_note", diff: { versionId, note } });
    return { id: versionId };
  });
}

/** Removes a version uploaded by mistake (never the only one). Its file goes straight away. */
export async function deleteVersion(ctx: RequestContext, versionId: string) {
  const version = await db.documentVersion.findUnique({ where: { id: versionId } });
  if (!version) throw notFound("Version not found");
  await db.$transaction(async (tx) => {
    const document = await ownDocument(tx, ctx, version.documentId);
    const others = await tx.documentVersion.findMany({ where: { documentId: document.id, id: { not: versionId } }, orderBy: { createdAt: "desc" } });
    if (!others.length) throw conflict("This is the only version. Delete the document instead.");
    await tx.documentPage.deleteMany({ where: { versionId } });
    await tx.documentVersion.delete({ where: { id: versionId } });
    if (document.currentVersionId === versionId) await tx.libraryDocument.update({ where: { id: document.id }, data: { currentVersionId: others[0]!.id } });
    await purgeStoredFile(tx, version.fileId);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: document.companyId, entityType: "LibraryDocument", entityId: document.id, action: "version_removed", diff: { title: document.title, versionId } });
  });
  await removePages(versionId);
  return { id: versionId, deleted: true };
}

/** To Recently deleted (Settings › Storage), restorable until the clean-up removes it. */
export async function deleteDocument(ctx: RequestContext, documentId: string) {
  return db.$transaction(async (tx) => {
    const document = await ownDocument(tx, ctx, documentId);
    await tx.libraryDocument.update({ where: { id: documentId }, data: { deletedAt: new Date(), deletedById: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: document.companyId, entityType: "LibraryDocument", entityId: documentId, action: "deleted", diff: { title: document.title } });
    return { id: documentId, deleted: true };
  });
}

export async function restoreDocument(ctx: RequestContext, documentId: string) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const document = await ownDocument(tx, ctx, documentId, { deleted: true });
    if (!document.deletedAt) return { id: documentId };
    const data: Prisma.LibraryDocumentUncheckedUpdateInput = { deletedAt: null, deletedById: null };
    // Its library or folder may have gone in the meantime.
    if (document.libraryId && !(await tx.documentLibrary.findFirst({ where: { id: document.libraryId, deletedAt: null } }))) {
      const first = await tx.documentLibrary.findFirst({ where: { companyId, deletedAt: null }, orderBy: { sort: "asc" } });
      if (!first) throw conflict("Add a library first, then restore it");
      data.libraryId = first.id;
    }
    if (document.folderId && !(await tx.jobDocumentFolder.findFirst({ where: { id: document.folderId, deletedAt: null } }))) data.folderId = null;
    await tx.libraryDocument.update({ where: { id: documentId }, data });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "LibraryDocument", entityId: documentId, action: "restored", diff: { title: document.title } });
    return { id: documentId };
  });
}

// ---------------------------------------------------------------------
// Pinning library documents to jobs
// ---------------------------------------------------------------------

/** Jobs to pin to: the person's active jobs. */
export async function jobsToPinTo(ctx: RequestContext) {
  return (await myActiveJobs(ctx, 50)).map((job) => ({ id: job.id, name: job.name, meta: job.siteName }));
}

export async function linkToJob(ctx: RequestContext, documentId: string, input: { projectId: string; folderId: string | null }) {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, input.projectId);
  await assertNotArchived(input.projectId);
  return db.$transaction(async (tx) => {
    const document = await ownDocument(tx, ctx, documentId);
    if (!document.libraryId) throw badRequest("Only library documents can be pinned to a job");
    if (input.folderId) await ownFolder(tx, companyId, input.projectId, input.folderId);
    const link = await tx.documentLink.upsert({
      where: { documentId_projectId: { documentId, projectId: input.projectId } },
      create: { companyId, documentId, projectId: input.projectId, folderId: input.folderId, createdById: ctx.userId },
      update: { folderId: input.folderId },
    });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "DocumentLink", entityId: link.id, action: "pinned", diff: { title: document.title, projectId: input.projectId } });
    return { id: link.id };
  });
}

async function ownLink(tx: Tx, ctx: RequestContext, linkId: string) {
  const link = await tx.documentLink.findFirst({ where: { id: linkId, companyId: requireCompany(ctx) } });
  if (!link) throw notFound("Not found");
  await jobOrThrow(ctx, link.projectId);
  return link;
}

export async function moveLink(ctx: RequestContext, linkId: string, folderId: string | null) {
  return db.$transaction(async (tx) => {
    const link = await ownLink(tx, ctx, linkId);
    if (folderId) await ownFolder(tx, link.companyId, link.projectId, folderId);
    await tx.documentLink.update({ where: { id: linkId }, data: { folderId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: link.companyId, entityType: "DocumentLink", entityId: linkId, action: "moved", diff: { folderId } });
    return { id: linkId };
  });
}

/** Takes it off the job; the library copy isn't touched. */
export async function unlink(ctx: RequestContext, linkId: string) {
  return db.$transaction(async (tx) => {
    const link = await ownLink(tx, ctx, linkId);
    await tx.documentLink.delete({ where: { id: linkId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: link.companyId, entityType: "DocumentLink", entityId: linkId, action: "unpinned", diff: { documentId: link.documentId, projectId: link.projectId } });
    return { id: linkId, deleted: true };
  });
}

// ---------------------------------------------------------------------
// Rendering (background job "documents.render")
// ---------------------------------------------------------------------

/**
 * Gets a version ready for the viewer. `again` is a re-render of one
 * that's already showing (Settings › Plans & PDFs › Re-render existing):
 * it stays viewable throughout, and a failure keeps the old pictures.
 */
export async function renderVersion(versionId: string, again = false) {
  const version = await db.documentVersion.findUnique({ where: { id: versionId } });
  if (!version) return;
  const file = await db.storedFile.findUnique({ where: { id: version.fileId } });
  if (!file || file.purgedAt) {
    await db.documentVersion.update({ where: { id: versionId }, data: { status: "FAILED", error: "The uploaded file is missing" } });
    return;
  }
  try {
    if (documentKind(file.mime) === "spreadsheet") {
      const sheets = readWorkbook(await readFile(storedFilePath(file)), { csv: file.mime === "text/csv" });
      if (!sheets.length) throw new Error("The spreadsheet has no sheets Grid can show");
      await writeSheets(versionId, sheets);
      // Keep header rows already chosen (a re-render after Try again).
      const before = new Map(((version.sheets ?? []) as unknown as SheetSummary[]).map((sheet) => [sheet.name, sheet.headerRow]));
      const summary = summarise(sheets).map((sheet) => ({ ...sheet, headerRow: Math.min(before.get(sheet.name) ?? sheet.headerRow, Math.max(0, sheet.rows - 1)) }));
      await db.documentVersion.update({ where: { id: versionId }, data: { status: "READY", error: null, sheets: summary as unknown as Prisma.InputJsonValue, cacheBytes: await folderBytes(pagesDir(versionId)), copiesDroppedAt: null } });
      await readTextQuietly(versionId);
      return;
    }
    const sizes = await renderPdfPages(storedFilePath(file), versionId);
    await db.documentVersion.update({ where: { id: versionId }, data: { status: "READY", error: null, pages: sizes.length, pageSizes: sizes, cacheBytes: await folderBytes(pagesDir(versionId)), copiesDroppedAt: null } });
    await readTextQuietly(versionId);
  } catch (error) {
    console.error(`[documents] couldn't render version ${versionId}`, error);
    if (again) return;
    await db.documentVersion.update({ where: { id: versionId }, data: { status: "FAILED", error: ((error as Error).message || "Couldn't read the file").slice(0, 300) } });
  }
}

/** Text for search (and find on page). Failing here never fails the viewer: the nightly documents.text tries again. */
async function readTextQuietly(versionId: string) {
  try {
    await extractText(versionId);
  } catch (error) {
    console.error(`[documents] couldn't read the text of version ${versionId}`, error);
  }
}

/** Find on page: where the words appear on a PDF version's pages (boxes for the viewer to highlight). */
export async function findOnPage(ctx: RequestContext, versionId: string, query: string) {
  if (!(await canSeeVersion(ctx, versionId))) throw notFound();
  if (query.trim().length < 2) return { matches: [], ready: true };
  return findInVersion(versionId, query);
}

/** Settings › Plans & PDFs › Re-render existing: every PDF version that's showing, drawn again at the current level. */
export async function rerenderAll() {
  const versions = await db.documentVersion.findMany({ where: { status: "READY", pages: { gt: 0 }, copiesDroppedAt: null, document: { deletedAt: null, purgedAt: null } }, select: { id: true, fileId: true } });
  const pdfs = new Set((await db.storedFile.findMany({ where: { id: { in: versions.map((version) => version.fileId) }, mime: "application/pdf" }, select: { id: true } })).map((file) => file.id));
  for (const version of versions) if (pdfs.has(version.fileId)) await app().jobs.send("documents.render", { versionId: version.id, again: true });
  return { queued: versions.filter((version) => pdfs.has(version.fileId)).length };
}

export async function retryRender(ctx: RequestContext, versionId: string) {
  const version = await db.documentVersion.findUnique({ where: { id: versionId } });
  if (!version) throw notFound("Version not found");
  await ownDocument(db, ctx, version.documentId);
  await db.documentVersion.update({ where: { id: versionId }, data: { status: "PENDING", error: null } });
  await app().jobs.send("documents.render", { versionId });
  return { id: versionId, status: "PENDING" };
}

/** The viewer checks back while pages are being made. */
export async function versionStatus(ctx: RequestContext, versionId: string) {
  const version = await db.documentVersion.findUnique({ where: { id: versionId } });
  if (!version) throw notFound("Version not found");
  await ownDocument(db, ctx, version.documentId);
  return { id: version.id, status: version.status, error: version.error, pages: version.pages, pageSizes: version.pageSizes as [number, number][], sheets: (version.sheets ?? []) as unknown as SheetSummary[] };
}

/** Changes which row is a sheet's header for this version (shown row index, 0 = first). */
export async function setHeaderRow(ctx: RequestContext, versionId: string, sheetIndex: number, headerRow: number) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const version = await tx.documentVersion.findUnique({ where: { id: versionId } });
    if (!version) throw notFound("Version not found");
    const document = await ownDocument(tx, ctx, version.documentId);
    const sheets = [...((version.sheets ?? []) as unknown as SheetSummary[])];
    const sheet = sheets[sheetIndex];
    if (!sheet) throw notFound("Sheet not found");
    if (headerRow >= Math.max(1, sheet.rows)) throw badRequest(`That sheet has ${sheet.rows} rows`);
    sheets[sheetIndex] = { ...sheet, headerRow };
    await tx.documentVersion.update({ where: { id: versionId }, data: { sheets: sheets as unknown as Prisma.InputJsonValue } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "LibraryDocument", entityId: document.id, action: "header_row_changed", diff: { title: document.title, sheet: sheet.name, from: sheet.headerRow, to: headerRow } });
    return { sheets };
  });
}

/** One sheet's viewer JSON. A version never changes, so phones keep it. */
export async function sheetResponse(ctx: RequestContext, versionId: string, index: number) {
  if (!(await canSeeVersion(ctx, versionId))) throw notFound();
  const full = path.join(pagesDir(versionId), sheetFile(index));
  try {
    const stats = await stat(/*turbopackIgnore: true*/ full);
    return new Response(Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ full)) as ReadableStream, {
      headers: { "content-type": "application/json", "content-length": String(stats.size), "cache-control": "private, max-age=31536000, immutable" },
    });
  } catch {
    throw notFound("Sheet not found");
  }
}

// ---------------------------------------------------------------------
// Serving pages and files
// ---------------------------------------------------------------------

/** Remembers for a minute who may see which version (a long manual loads hundreds of pages). */
const seen = new Map<string, number>();
async function canSeeVersion(ctx: RequestContext, versionId: string) {
  const key = `${ctx.userId}:${ctx.companyId}:${versionId}`;
  const expiresAt = seen.get(key);
  if (expiresAt && expiresAt > Date.now()) return true;
  const version = await db.documentVersion.findUnique({ where: { id: versionId }, select: { document: { select: { companyId: true, projectId: true, deletedAt: true } } } });
  if (!version || version.document.companyId !== ctx.companyId) return false;
  if (version.document.deletedAt && !can(ctx, "documents.delete")) return false;
  if (version.document.projectId && !(await canSeeJob(ctx, version.document.projectId))) return false;
  if (seen.size > 5000) seen.clear();
  seen.set(key, Date.now() + 60_000);
  return true;
}

/** A rendered page ("p12.jpg") or the thumbnail. A version never changes, so phones keep them. */
export async function pageResponse(ctx: RequestContext, versionId: string, name: string) {
  if (!/^(p\d{1,5}|thumb)\.jpg$/.test(name)) throw notFound();
  if (!(await canSeeVersion(ctx, versionId))) throw notFound();
  const full = path.join(pagesDir(versionId), name);
  try {
    const stats = await stat(/*turbopackIgnore: true*/ full);
    return new Response(Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ full)) as ReadableStream, {
      headers: { "content-type": "image/jpeg", "content-length": String(stats.size), "cache-control": "private, max-age=31536000, immutable" },
    });
  } catch {
    throw notFound();
  }
}

/**
 * /api/files asks this before handing over a document's file. Photos are
 * always viewable; other files only download when the document allows it
 * (or for people who can change documents).
 */
export async function canReadDocumentFile(ctx: RequestContext, fileId: string) {
  if (!ctx.companyId) return false;
  const version = await db.documentVersion.findFirst({ where: { fileId, document: { companyId: ctx.companyId } }, include: { document: true } });
  if (!version) return false;
  const { document } = version;
  if (document.deletedAt && !can(ctx, "documents.delete")) return false;
  if (document.projectId && !(await canSeeJob(ctx, document.projectId))) return false;
  const file = await db.storedFile.findUnique({ where: { id: fileId }, select: { mime: true } });
  if (file && documentKind(file.mime) === "image") return true;
  return document.allowDownload || can(ctx, "documents.edit");
}

// ---------------------------------------------------------------------
// Recently deleted (Settings › Storage)
// ---------------------------------------------------------------------

export async function listDeleted(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const documents = await db.libraryDocument.findMany({
    where: { companyId, deletedAt: { not: null }, purgedAt: null },
    include: withCurrent,
    orderBy: { deletedAt: "desc" },
    take: 500,
  });
  const files = await filesOf(documents.flatMap((document) => document.versions.map((version) => version.fileId)));
  const people = new Map((await db.user.findMany({ where: { id: { in: documents.map((document) => document.deletedById ?? "") } }, select: { id: true, name: true } })).map((user) => [user.id, user.name]));
  const libraries = new Map((await db.documentLibrary.findMany({ where: { companyId }, select: { id: true, name: true } })).map((library) => [library.id, library.name]));
  const jobs = new Map((await db.project.findMany({ where: { id: { in: documents.map((document) => document.projectId ?? "") } }, select: { id: true, name: true } })).map((job) => [job.id, job.name]));
  return documents.map((document) => ({
    id: document.id,
    title: document.title,
    where: document.libraryId ? (libraries.get(document.libraryId) ?? "Library") : (jobs.get(document.projectId ?? "") ?? "A job"),
    versions: document.versions.length,
    bytes: document.versions.reduce((total, version) => total + (files.get(version.fileId)?.size ?? 0), 0),
    deletedBy: people.get(document.deletedById ?? "") ?? "Someone",
    deletedAt: document.deletedAt!,
  }));
}

/** Removes deleted documents for good now, before Recently deleted runs out. */
export async function deleteNow(ctx: RequestContext, ids: string[]) {
  const companyId = requireCompany(ctx);
  const documents = await db.libraryDocument.findMany({ where: { id: { in: ids }, companyId, deletedAt: { not: null }, purgedAt: null }, include: { versions: true } });
  let bytes = 0;
  for (const document of documents) {
    await db.$transaction(async (tx) => {
      for (const version of document.versions) bytes += await purgeStoredFile(tx, version.fileId);
      await tx.libraryDocument.update({ where: { id: document.id }, data: { purgedAt: new Date() } });
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "LibraryDocument", entityId: document.id, action: "purged", diff: { title: document.title } });
    });
    for (const version of document.versions) await removePages(version.id);
  }
  return { removed: documents.length, bytes };
}

// ---------------------------------------------------------------------
// For Blocks that build on spreadsheets (row sign-offs)
// ---------------------------------------------------------------------

/**
 * A spreadsheet document this person may see, at its current version (or
 * `versionId`): its sheets, each sheet's viewer data, and a copy of the
 * file with columns added. 404 if it isn't theirs or isn't a spreadsheet.
 */
export async function spreadsheetForBlock(ctx: RequestContext, documentId: string, versionId?: string | null) {
  const document = await ownDocument(db, ctx, documentId);
  const version = await db.documentVersion.findFirst({ where: { documentId, id: versionId ?? document.currentVersionId ?? undefined }, orderBy: { createdAt: "desc" } });
  if (!version) throw notFound("Version not found");
  const file = await db.storedFile.findUnique({ where: { id: version.fileId } });
  if (!file || documentKind(file.mime) !== "spreadsheet") throw notFound("That document isn't a spreadsheet");
  const sheets = (version.sheets ?? []) as unknown as SheetSummary[];
  return {
    document: { id: document.id, title: document.title, projectId: document.projectId, allowDownload: document.allowDownload },
    /** ready: read, and not dropped for an archived job (open it to read it again). */
    version: { id: version.id, isCurrent: version.id === document.currentVersionId, ready: version.status === "READY" && !version.copiesDroppedAt },
    sheets,
    /** One sheet as the viewer has it (made when the version was read). */
    readSheet: async (index: number): Promise<SheetData> => JSON.parse(await readFile(path.join(pagesDir(version.id), sheetFile(index)), "utf8")) as SheetData,
    /** A copy of the original with columns added; the original isn't touched. */
    copyWithColumns: async (additions: Record<string, AddedColumns>) => addColumns(await readFile(storedFilePath(file)), additions, { csv: file.mime === "text/csv" }),
  };
}
