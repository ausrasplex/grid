// Kit pieces, manuals and documents, and copies (docs/assets-block.md
// "What part 4b built"), as Docket does them for fixtures:
//   - Kit pieces (Docket's Parts): the batteries, charger and case that
//     come with a drill, each with its own model, serial and warranty.
//   - Manuals, links and documents: a file or a link, on the whole asset
//     or one piece. Manuals, warranties and links are shared by an asset's
//     copies (Duplicate gives them one docSetId); receipts, certificates
//     and photos stay on the copy they were filed to.
//   - Duplicate: the same model again, each copy with its own number, QR
//     tag and serials; details, kit pieces and its own routines copied.

import "server-only";
import { badRequest, notFound, requireCompany, type RequestContext } from "@grid/core";
import { attachFile, audit, db, ensureRouteCode, purgeStoredFile, type Tx } from "@grid/db";
import { warrantyState, type WarrantyState } from "./due";
import { refreshDue } from "./inspections";
import type { DocumentInput, DuplicateInput, PartInput } from "./validation";

const MOD = "assets";

/** Kinds filed to every copy of the same model. */
export const SHARED_KINDS = ["MANUAL", "WARRANTY", "LINK"] as const;
const isShared = (kind: string) => (SHARED_KINDS as readonly string[]).includes(kind);

const dayOf = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
const asDate = (day: string | null) => (day ? new Date(`${day}T00:00:00Z`) : null);

async function ownAsset(tx: Tx, companyId: string, id: string) {
  const asset = await tx.asset.findFirst({ where: { id, companyId, deletedAt: null } });
  if (!asset) throw notFound("Asset not found");
  return asset;
}

// ─── Kit pieces ─────────────────────────────────────────────────────────

export interface PartView {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  serial: string | null;
  warrantyEndsOn: string | null;
  warranty: WarrantyState;
  photoFileId: string | null;
  notes: string | null;
  documentCount: number;
}

export async function partsFor(ctx: RequestContext, assetId: string): Promise<PartView[]> {
  const companyId = requireCompany(ctx);
  await ownAsset(db, companyId, assetId);
  const rows = await db.assetPart.findMany({
    where: { assetId, deletedAt: null },
    include: { _count: { select: { documents: { where: { deletedAt: null } } } } },
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    make: row.make,
    model: row.model,
    serial: row.serial,
    warrantyEndsOn: dayOf(row.warrantyEndsOn),
    warranty: warrantyState(dayOf(row.warrantyEndsOn)),
    photoFileId: row.photoFileId,
    notes: row.notes,
    documentCount: row._count.documents,
  }));
}

export async function savePart(ctx: RequestContext, assetId: string, id: string | null, input: PartInput) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(db, companyId, assetId);
  await db.$transaction(async (tx) => {
    const before = id ? await tx.assetPart.findFirst({ where: { id, assetId, deletedAt: null } }) : null;
    if (id && !before) throw notFound("That piece isn't there any more");
    if (input.photoFileId && input.photoFileId !== before?.photoFileId) await attachFile(tx, input.photoFileId, { companyId, userId: ctx.userId, blockId: MOD });
    if (before?.photoFileId && before.photoFileId !== input.photoFileId) await purgeStoredFile(tx, before.photoFileId);
    const data = { name: input.name, make: input.make, model: input.model, serial: input.serial, warrantyEndsOn: asDate(input.warrantyEndsOn), photoFileId: input.photoFileId, notes: input.notes };
    let partId = id;
    if (before) await tx.assetPart.update({ where: { id: before.id }, data });
    else {
      const last = await tx.assetPart.aggregate({ where: { assetId }, _max: { sort: true } });
      partId = (await tx.assetPart.create({ data: { ...data, companyId, assetId, sort: (last._max.sort ?? 0) + 1 } })).id;
      if (!asset.partsEnabled) await tx.asset.update({ where: { id: assetId }, data: { partsEnabled: true } });
    }
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetPart", entityId: partId!, action: before ? "updated" : "created", diff: { asset: asset.number, name: input.name, serial: input.serial ?? undefined } });
  });
  return partsFor(ctx, assetId);
}

/** Takes a piece off the kit, with its photo and documents. */
export async function removePart(ctx: RequestContext, assetId: string, id: string) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(db, companyId, assetId);
  await db.$transaction(async (tx) => {
    const before = await tx.assetPart.findFirst({ where: { id, assetId, deletedAt: null }, include: { documents: { where: { deletedAt: null } } } });
    if (!before) throw notFound("That piece isn't there any more");
    if (before.photoFileId) await purgeStoredFile(tx, before.photoFileId);
    for (const document of before.documents) if (document.fileId) await purgeStoredFile(tx, document.fileId);
    await tx.assetDocument.updateMany({ where: { partId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.assetPart.update({ where: { id }, data: { deletedAt: new Date(), photoFileId: null } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetPart", entityId: id, action: "removed", diff: { asset: asset.number, name: before.name } });
  });
  return partsFor(ctx, assetId);
}

// ─── Manuals, links and documents ───────────────────────────────────────

export interface DocumentView {
  id: string;
  kind: string;
  title: string;
  fileId: string | null;
  url: string | null;
  /** "application/pdf", "image/jpeg"; null for a link. */
  mime: string | null;
  partId: string | null;
  /** Filed to another copy and shared with this one (a manual, warranty or link). */
  fromCopy: boolean;
  /** Shared with this asset's copies. */
  shared: boolean;
  addedAt: Date;
}

/** Its own documents, and the manuals, warranties and links filed to its copies. */
export async function documentsFor(ctx: RequestContext, assetId: string): Promise<{ documents: DocumentView[]; copies: number }> {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(db, companyId, assetId);
  const copies = asset.docSetId ? await db.asset.findMany({ where: { companyId, docSetId: asset.docSetId, deletedAt: null, id: { not: assetId } }, select: { id: true } }) : [];
  const rows = await db.assetDocument.findMany({
    where: {
      companyId,
      deletedAt: null,
      OR: [{ assetId }, ...(copies.length ? [{ assetId: { in: copies.map((copy) => copy.id) }, partId: null, kind: { in: [...SHARED_KINDS] } }] : [])],
    },
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
  });
  const files = await db.storedFile.findMany({ where: { companyId, id: { in: rows.flatMap((row) => (row.fileId ? [row.fileId] : [])) } }, select: { id: true, mime: true } });
  const mime = new Map(files.map((file) => [file.id, file.mime]));
  return {
    copies: copies.length,
    documents: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      fileId: row.fileId,
      url: row.url,
      mime: row.fileId ? (mime.get(row.fileId) ?? null) : null,
      partId: row.partId,
      fromCopy: row.assetId !== assetId,
      shared: copies.length > 0 && !row.partId && isShared(row.kind),
      addedAt: row.createdAt,
    })),
  };
}

export async function addDocument(ctx: RequestContext, assetId: string, input: DocumentInput) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(db, companyId, assetId);
  await db.$transaction(async (tx) => {
    if (input.partId && !(await tx.assetPart.findFirst({ where: { id: input.partId, assetId, deletedAt: null }, select: { id: true } }))) throw badRequest("That piece isn't there any more");
    if (input.fileId) await attachFile(tx, input.fileId, { companyId, userId: ctx.userId, blockId: MOD });
    const last = await tx.assetDocument.aggregate({ where: { assetId }, _max: { sort: true } });
    const row = await tx.assetDocument.create({
      data: { companyId, assetId, partId: input.partId, kind: input.url && !input.fileId ? "LINK" : input.kind, title: input.title, fileId: input.fileId, url: input.fileId ? null : input.url, sort: (last._max.sort ?? 0) + 1, createdById: ctx.userId },
    });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetDocument", entityId: row.id, action: "created", diff: { asset: asset.number, title: input.title, kind: row.kind } });
  });
  return documentsFor(ctx, assetId);
}

/** Renames a document, or files it under another kind. */
export async function renameDocument(ctx: RequestContext, assetId: string, id: string, input: { title: string; kind: DocumentInput["kind"] }) {
  const companyId = requireCompany(ctx);
  await ownAsset(db, companyId, assetId);
  await db.$transaction(async (tx) => {
    const before = await tx.assetDocument.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!before) throw notFound("That document isn't there any more");
    await tx.assetDocument.update({ where: { id }, data: { title: input.title, kind: before.url ? "LINK" : input.kind } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetDocument", entityId: id, action: "updated", diff: { title: input.title, before: before.title } });
  });
  return documentsFor(ctx, assetId);
}

/** Removes a document (from every copy, if it's shared); its file goes. */
export async function removeDocument(ctx: RequestContext, assetId: string, id: string) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(db, companyId, assetId);
  await db.$transaction(async (tx) => {
    const before = await tx.assetDocument.findFirst({ where: { id, companyId, deletedAt: null }, include: { asset: { select: { docSetId: true } } } });
    // Its own, or one shared from a copy of the same model.
    if (!before || (before.assetId !== assetId && (!asset.docSetId || before.asset.docSetId !== asset.docSetId))) throw notFound("That document isn't there any more");
    if (before.fileId) await purgeStoredFile(tx, before.fileId);
    await tx.assetDocument.update({ where: { id }, data: { deletedAt: new Date(), fileId: null } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetDocument", entityId: id, action: "removed", diff: { asset: asset.number, title: before.title } });
  });
  return documentsFor(ctx, assetId);
}

/**
 * When an asset is deleted: its pieces and documents go with it, except
 * the manuals, warranties and links its copies share, which move to a copy.
 */
export async function removeKitAndDocuments(tx: Tx, asset: { id: string; companyId: string; docSetId: string | null }) {
  const heir = asset.docSetId ? await tx.asset.findFirst({ where: { companyId: asset.companyId, docSetId: asset.docSetId, deletedAt: null, id: { not: asset.id } }, select: { id: true } }) : null;
  if (heir) await tx.assetDocument.updateMany({ where: { assetId: asset.id, partId: null, deletedAt: null, kind: { in: [...SHARED_KINDS] } }, data: { assetId: heir.id } });
  const documents = await tx.assetDocument.findMany({ where: { assetId: asset.id, deletedAt: null }, select: { fileId: true } });
  const parts = await tx.assetPart.findMany({ where: { assetId: asset.id, deletedAt: null }, select: { photoFileId: true } });
  for (const fileId of [...documents.map((document) => document.fileId), ...parts.map((part) => part.photoFileId)]) if (fileId) await purgeStoredFile(tx, fileId);
  await tx.assetDocument.updateMany({ where: { assetId: asset.id, deletedAt: null }, data: { deletedAt: new Date(), fileId: null } });
  await tx.assetPart.updateMany({ where: { assetId: asset.id, deletedAt: null }, data: { deletedAt: new Date(), photoFileId: null } });
}

// ─── Duplicate ──────────────────────────────────────────────────────────

/**
 * Copies of the same model: each gets the next number and its own QR tag
 * and serials. Details, category fields, kit pieces and its own routines
 * are copied; manuals, warranties and links are shared (docSetId).
 * Photos, the log, custody and faults stay with the original.
 */
export async function duplicate(ctx: RequestContext, assetId: string, input: DuplicateInput) {
  const companyId = requireCompany(ctx);
  const original = await db.asset.findFirst({
    where: { id: assetId, companyId, deletedAt: null },
    include: { parts: { where: { deletedAt: null }, orderBy: { sort: "asc" } }, routines: { where: { deletedAt: null } } },
  });
  if (!original) throw notFound("Asset not found");
  const ids = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assets:number:${companyId}`}))`;
    const docSetId = original.docSetId ?? crypto.randomUUID();
    if (!original.docSetId) await tx.asset.update({ where: { id: original.id }, data: { docSetId } });
    const last = await tx.asset.aggregate({ where: { companyId }, _max: { number: true } });
    let number = last._max.number ?? 0;
    const made: { id: string; number: number }[] = [];
    for (const copy of input.copies) {
      const id = crypto.randomUUID();
      number += 1;
      const tagCode = await ensureRouteCode(tx, { blockId: MOD, entityType: "Asset", entityId: id, companyId, createdById: ctx.userId });
      await tx.asset.create({
        data: {
          id,
          companyId,
          number,
          tagCode,
          docSetId,
          name: original.name,
          categoryId: original.categoryId,
          make: original.make,
          model: original.model,
          serial: copy.serial,
          purchasedOn: original.purchasedOn,
          warrantyEndsOn: original.warrantyEndsOn,
          supplier: original.supplier,
          purchasePrice: original.purchasePrice,
          replacementValue: original.replacementValue,
          productUrl: original.productUrl,
          brandId: original.brandId,
          partsEnabled: original.partsEnabled,
          serviceEnabled: original.serviceEnabled,
          notes: original.notes,
          fields: original.fields ?? {},
          createdById: ctx.userId,
        },
      });
      for (const part of original.parts) {
        await tx.assetPart.create({
          data: { companyId, assetId: id, name: part.name, make: part.make, model: part.model, serial: copy.partSerials[part.id]?.trim() || null, warrantyEndsOn: part.warrantyEndsOn, notes: part.notes, sort: part.sort },
        });
      }
      for (const routine of original.routines) {
        await tx.assetRoutine.create({ data: { companyId, assetId: id, name: routine.name, everyMonths: routine.everyMonths, mustPass: routine.mustPass, notes: routine.notes, sort: routine.sort } });
      }
      await refreshDue(tx, id);
      made.push({ id, number });
    }
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "Asset",
      entityId: original.id,
      action: "duplicated",
      diff: { number: original.number, name: original.name, copies: made.map((entry) => entry.number) },
    });
    return made;
  });
  return { ids: ids.map((entry) => entry.id), numbers: ids.map((entry) => entry.number) };
}
