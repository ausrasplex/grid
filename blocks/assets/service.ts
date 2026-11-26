// Assets (docs/assets-block.md §1): the business's tools and gear, their
// categories (each with its own fields), and the QR tag on each one. The
// tag is a route code (RouteCode, blockId assets), so /go/<code> opens the
// asset like any other quick-route link. Sticker sheets are in stickers.ts.

import "server-only";
import { badRequest, conflict, notFound, requireCompany, type RequestContext } from "@grid/core";
import { attachFile, audit, db, ensureRouteCode, normaliseRouteCode, purgeStoredFile, routeCodeUrl, type Prisma, type Tx } from "@grid/db";
import { tradePreset } from "@grid/block-companies/trades";
import { heldBy, holdersFor, type Holder } from "./custody";
import { refreshStatus } from "./faults";
import { dueChips, intervalText, refreshCategory, refreshDue, setServiceEnabled } from "./inspections";
import type { Due } from "./due";
import { presetCategories, type CategoryField } from "./presets";
import type { AssetInput, CategoryInput, ListQuery, RoutineInput } from "./validation";

const MOD = "assets";

export type AssetStatus = "IN_SERVICE" | "FAULTY" | "OUT_OF_SERVICE" | "IN_REPAIR" | "RETIRED" | "LOST" | "OVERDUE";
export type FieldValue = string | number | boolean | null;

export interface AssetView {
  id: string;
  number: number;
  name: string;
  categoryId: string | null;
  category: string | null;
  make: string | null;
  model: string | null;
  serial: string | null;
  /** "2026-03-14". */
  purchasedOn: string | null;
  photoFileIds: string[];
  notes: string | null;
  fields: Record<string, FieldValue>;
  status: AssetStatus;
  tagCode: string;
  barcode: string | null;
  /** Who has it and where it is (part 2). */
  holder: Holder;
  /** The most urgent routine, when one is due soon or overdue (part 4). */
  due: Due | null;
  /** "Track tests and servicing". */
  serviceEnabled: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryRoutineView {
  id: string;
  name: string;
  everyMonths: number | null;
  mustPass: boolean;
  notes: string | null;
  interval: string;
}

export interface CategoryView {
  id: string;
  name: string;
  fields: CategoryField[];
  /** Routines every asset in it follows (part 4). */
  routines: CategoryRoutineView[];
  /** Assets in it, not counting retired ones. */
  count: number;
}

const asFields = (value: Prisma.JsonValue): CategoryField[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const { key, label, type } = entry as Record<string, unknown>;
        return typeof key === "string" && typeof label === "string" && (type === "text" || type === "number" || type === "date" || type === "yesno") ? [{ key, label, type }] : [];
      })
    : [];

const asValues = (value: Prisma.JsonValue): Record<string, FieldValue> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, FieldValue> = {};
  for (const [key, entry] of Object.entries(value)) if (entry === null || ["string", "number", "boolean"].includes(typeof entry)) out[key] = entry as FieldValue;
  return out;
};

const dayText = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

type AssetRow = Prisma.AssetGetPayload<{ include: { category: { select: { name: true } } } }>;

function view(row: AssetRow, holder: Holder, due: Due | null = null): AssetView {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    categoryId: row.categoryId,
    category: row.category?.name ?? null,
    make: row.make,
    model: row.model,
    serial: row.serial,
    purchasedOn: dayText(row.purchasedOn),
    photoFileIds: row.photoFileIds,
    notes: row.notes,
    fields: asValues(row.fields),
    status: row.status,
    tagCode: row.tagCode,
    barcode: row.barcode,
    holder,
    due,
    serviceEnabled: row.serviceEnabled,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const include = { category: { select: { name: true } } } as const;

async function ownAsset(tx: Tx, companyId: string, id: string) {
  const row = await tx.asset.findFirst({ where: { id, companyId, deletedAt: null }, include });
  if (!row) throw notFound("Asset not found");
  return row;
}

/** A typed number or barcode: ignore case and spaces. */
const cleanBarcode = (value: string | null) => (value ? value.trim().replace(/\s+/g, "") : null);

// ─── Assets ──────────────────────────────────────────────────────────────

export async function listAssets(ctx: RequestContext, query: ListQuery = {}): Promise<AssetView[]> {
  const companyId = requireCompany(ctx);
  const where: Prisma.AssetWhereInput = { companyId, deletedAt: null };
  if (query.show !== "all") where.status = query.show === "retired" ? "RETIRED" : { not: "RETIRED" };
  if (query.show === "mine") where.id = { in: await heldBy(companyId, ctx.userId) };
  if (query.category) where.categoryId = query.category === "none" ? null : query.category;
  const text = query.q?.trim();
  if (text) {
    const number = Number(text.replace(/^(asset\s*(no\.?)?\s*|#)/i, ""));
    const contains = { contains: text, mode: "insensitive" as const };
    where.OR = [
      { name: contains },
      { make: contains },
      { model: contains },
      { serial: contains },
      { barcode: contains },
      { notes: contains },
      { tagCode: { contains: normaliseRouteCode(text) || text, mode: "insensitive" } },
      { category: { name: contains } },
      ...(Number.isInteger(number) && number > 0 ? [{ number }] : []),
    ];
  }
  const rows = await db.asset.findMany({ where, include, orderBy: [{ number: "asc" }] });
  const assets = await withHolders(companyId, rows);
  // Due: anything with a routine overdue or due in the next 30 days, most urgent first.
  if (query.show === "due") {
    const rank = { overdue: 0, soon: 1, ok: 2, none: 3 } as const;
    return assets.filter((asset) => asset.due).sort((a, b) => rank[a.due!.tone] - rank[b.due!.tone] || (a.due!.dueOn ?? "0").localeCompare(b.due!.dueOn ?? "0"));
  }
  return assets;
}

async function withHolders(companyId: string, rows: AssetRow[]) {
  const ids = rows.map((row) => row.id);
  const [holders, dues] = await Promise.all([holdersFor(companyId, ids), dueChips(companyId, ids)]);
  return rows.map((row) => view(row, holders.get(row.id)!, dues.get(row.id) ?? null));
}

export async function getAsset(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const row = await ownAsset(db, companyId, id);
  const category = row.categoryId ? await db.assetCategory.findFirst({ where: { id: row.categoryId, companyId } }) : null;
  const [asset] = await withHolders(companyId, [row]);
  return { asset: asset!, fields: category ? asFields(category.fields) : [], tagUrl: routeCodeUrl(row.tagCode) };
}

/** The next friendly number: one more than the highest. */
async function nextNumber(tx: Tx, companyId: string) {
  const last = await tx.asset.aggregate({ where: { companyId }, _max: { number: true } });
  return (last._max.number ?? 0) + 1;
}

export async function suggestedNumber(ctx: RequestContext) {
  return { number: await nextNumber(db, requireCompany(ctx)) };
}

/** Only the category's own fields are kept, each as its type. */
function cleanValues(fields: CategoryField[], values: Record<string, FieldValue>) {
  const out: Record<string, FieldValue> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (value === null || value === undefined || value === "") continue;
    if (field.type === "number") {
      const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
      if (!Number.isFinite(number)) throw badRequest(`${field.label} must be a number`);
      out[field.key] = number;
    } else if (field.type === "yesno") out[field.key] = value === true || value === "true" || value === "yes";
    else if (field.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw badRequest(`Pick a date for ${field.label}`);
      out[field.key] = String(value);
    } else out[field.key] = String(value).trim().slice(0, 500);
  }
  return out;
}

export async function saveAsset(ctx: RequestContext, id: string | null, input: AssetInput): Promise<AssetView> {
  const companyId = requireCompany(ctx);
  const barcode = cleanBarcode(input.barcode);
  const saved = await db.$transaction(async (tx) => {
    // One number at a time per business, so two people adding at once don't clash.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assets:number:${companyId}`}))`;
    const before = id ? await ownAsset(tx, companyId, id) : null;
    const category = input.categoryId ? await tx.assetCategory.findFirst({ where: { id: input.categoryId, companyId, deletedAt: null } }) : null;
    if (input.categoryId && !category) throw badRequest("That category isn't there any more");
    const number = input.number ?? before?.number ?? (await nextNumber(tx, companyId));
    if (number !== before?.number && (await tx.asset.findFirst({ where: { companyId, number }, select: { id: true } }))) {
      throw conflict(`Asset No. ${number} is already used. Pick another number, or leave it blank for the next one.`);
    }
    if (barcode && barcode !== before?.barcode) {
      const taken = await tx.asset.findFirst({ where: { companyId, deletedAt: null, barcode: { equals: barcode, mode: "insensitive" }, NOT: id ? { id } : undefined }, select: { number: true } });
      if (taken) throw conflict(`That barcode is already linked to Asset No. ${taken.number}`);
    }
    // New photos are attached to this Block; ones taken off go straight away.
    const photos = [...new Set(input.photoFileIds)];
    for (const fileId of photos) if (!before?.photoFileIds.includes(fileId)) await attachFile(tx, fileId, { companyId, userId: ctx.userId, blockId: MOD });
    for (const fileId of before?.photoFileIds ?? []) if (!photos.includes(fileId)) await purgeStoredFile(tx, fileId);

    const data = {
      number,
      name: input.name,
      categoryId: category?.id ?? null,
      make: input.make,
      model: input.model,
      serial: input.serial,
      purchasedOn: input.purchasedOn ? new Date(`${input.purchasedOn}T00:00:00Z`) : null,
      photoFileIds: photos,
      notes: input.notes,
      fields: (category ? cleanValues(asFields(category.fields), input.fields) : {}) as Prisma.InputJsonValue,
      barcode,
    };
    let row: AssetRow;
    if (before) {
      row = await tx.asset.update({ where: { id: before.id }, data, include });
    } else {
      const newId = crypto.randomUUID();
      const tagCode = await ensureRouteCode(tx, { blockId: MOD, entityType: "Asset", entityId: newId, companyId, createdById: ctx.userId });
      row = await tx.asset.create({ data: { ...data, id: newId, companyId, tagCode, createdById: ctx.userId }, include });
    }
    // Its category's routines follow it in or out.
    if (input.serviceEnabled !== undefined || !before || before.categoryId !== row.categoryId) {
      await setServiceEnabled(tx, row, input.serviceEnabled ?? before?.serviceEnabled ?? true);
      await refreshDue(tx, row.id);
      row = await tx.asset.findUniqueOrThrow({ where: { id: row.id }, include });
    }
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "Asset",
      entityId: row.id,
      action: before ? "updated" : "created",
      diff: { number, name: input.name, category: category?.name, ...(before ? { before: { number: before.number, name: before.name } } : {}) },
    });
    return row;
  });
  return (await withHolders(companyId, [saved]))[0]!;
}

/** Retire (no longer used, kept with its history and tag) or put back in service (its status then follows what's still open on it). */
export async function setStatus(ctx: RequestContext, id: string, status: "IN_SERVICE" | "RETIRED") {
  const companyId = requireCompany(ctx);
  const before = await ownAsset(db, companyId, id);
  const row = await db.$transaction(async (tx) => {
    await refreshStatus(tx, id, status === "RETIRED");
    const updated = await tx.asset.findUniqueOrThrow({ where: { id }, include });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Asset", entityId: id, action: status === "RETIRED" ? "retired" : "restored", diff: { number: before.number, name: before.name } });
    return updated;
  });
  return (await withHolders(companyId, [row]))[0]!;
}

/**
 * Deletes an asset added by mistake: its photos go and its tag stops
 * working (the code is kept, so a later scan says it isn't recognised).
 * Gear that was really used is retired instead, keeping its history.
 */
export async function deleteAsset(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const before = await ownAsset(db, companyId, id);
  await db.$transaction(async (tx) => {
    for (const fileId of before.photoFileIds) await purgeStoredFile(tx, fileId);
    await tx.routeCode.updateMany({ where: { entityType: "Asset", entityId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.asset.update({ where: { id }, data: { deletedAt: new Date(), photoFileIds: [], barcode: null } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Asset", entityId: id, action: "deleted", diff: { number: before.number, name: before.name } });
  });
  return { id, deleted: true };
}

/** A new QR tag, for a lost or damaged sticker: the old one stops working. */
export async function newTag(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const before = await ownAsset(db, companyId, id);
  const row = await db.$transaction(async (tx) => {
    await tx.routeCode.updateMany({ where: { entityType: "Asset", entityId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    const tagCode = await ensureRouteCode(tx, { blockId: MOD, entityType: "Asset", entityId: id, companyId, createdById: ctx.userId });
    const updated = await tx.asset.update({ where: { id }, data: { tagCode }, include });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Asset", entityId: id, action: "new_tag", diff: { number: before.number, before: before.tagCode, after: tagCode } });
    return updated;
  });
  return { asset: (await withHolders(companyId, [row]))[0]!, tagUrl: routeCodeUrl(row.tagCode) };
}

/**
 * What a scanned code that isn't one of Grid's links opens: an asset whose
 * barcode it is (an old sticker linked instead of a QR tag), or whose tag
 * code was typed in. Null when nothing matches.
 */
export async function scanLookup(ctx: RequestContext, text: string): Promise<string | null> {
  if (!ctx.companyId || !ctx.permissions.has("assets.view")) return null;
  const barcode = cleanBarcode(text);
  if (!barcode) return null;
  const code = normaliseRouteCode(text);
  const row = await db.asset.findFirst({
    where: { companyId: ctx.companyId, deletedAt: null, OR: [{ barcode: { equals: barcode, mode: "insensitive" } }, ...(code ? [{ tagCode: code }, { tagCode: { endsWith: `-${code}` } }] : [])] },
    select: { id: true },
  });
  return row ? `/assets/${row.id}` : null;
}

/** /api/files asks this: an asset's photos are seen by anyone in the business who can see assets. */
export async function canReadAssetFile(ctx: RequestContext, fileId: string): Promise<boolean> {
  if (!ctx.companyId || !ctx.permissions.has("assets.view")) return false;
  const companyId = ctx.companyId;
  // An asset's own photos, or a fault's (the report, or a later step).
  const [asset, fault, event, check] = await Promise.all([
    db.asset.findFirst({ where: { companyId, photoFileIds: { has: fileId } }, select: { id: true } }),
    db.assetFault.findFirst({ where: { companyId, photoFileIds: { has: fileId } }, select: { id: true } }),
    db.assetFaultEvent.findFirst({ where: { fault: { companyId }, photoFileIds: { has: fileId } }, select: { id: true } }),
    // A certificate, photo or invoice on a test or service (part 4).
    db.assetCheck.findFirst({ where: { companyId, fileIds: { has: fileId } }, select: { id: true } }),
  ]);
  return !!(asset || fault || event || check);
}

// ─── Categories ──────────────────────────────────────────────────────────

export async function listCategories(ctx: RequestContext): Promise<CategoryView[]> {
  const companyId = requireCompany(ctx);
  const [rows, counts] = await Promise.all([
    db.assetCategory.findMany({
      where: { companyId, deletedAt: null },
      include: { routines: { where: { deletedAt: null }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] } },
      orderBy: [{ sort: "asc" }, { name: "asc" }],
    }),
    db.asset.groupBy({ by: ["categoryId"], where: { companyId, deletedAt: null, status: { not: "RETIRED" } }, _count: { _all: true } }),
  ]);
  const count = new Map(counts.map((entry) => [entry.categoryId, entry._count._all]));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    fields: asFields(row.fields),
    routines: row.routines.map((routine) => ({ id: routine.id, name: routine.name, everyMonths: routine.everyMonths, mustPass: routine.mustPass, notes: routine.notes, interval: intervalText(routine.everyMonths) })),
    count: count.get(row.id) ?? 0,
  }));
}

/**
 * Brings a category's routines in line with the form: kept ones are
 * changed in place (so their log and due dates follow), new ones added,
 * missing ones removed. Then every asset in it is worked out again.
 */
async function syncRoutines(tx: Tx, companyId: string, categoryId: string, routines: RoutineInput[]) {
  const before = await tx.assetRoutine.findMany({ where: { categoryId, deletedAt: null } });
  const keep = new Set(routines.flatMap((routine) => (routine.id ? [routine.id] : [])));
  for (const old of before) if (!keep.has(old.id)) await tx.assetRoutine.update({ where: { id: old.id }, data: { deletedAt: new Date() } });
  for (const [index, routine] of routines.entries()) {
    const data = { name: routine.name, everyMonths: routine.everyMonths ?? null, mustPass: routine.mustPass, notes: routine.notes, sort: index + 1 };
    if (routine.id && before.some((old) => old.id === routine.id)) await tx.assetRoutine.update({ where: { id: routine.id }, data });
    else await tx.assetRoutine.create({ data: { ...data, companyId, categoryId } });
  }
  if (routines.length) await tx.asset.updateMany({ where: { categoryId, deletedAt: null }, data: { serviceEnabled: true } });
  await refreshCategory(tx, categoryId);
}

/** Field keys stay the same when a label is changed, so filled-in values follow. */
function cleanFields(fields: CategoryInput["fields"]): CategoryField[] {
  const seen = new Set<string>();
  return fields.map((field) => {
    let key = field.key;
    for (let index = 2; seen.has(key); index++) key = `${field.key}-${index}`;
    seen.add(key);
    return { key, label: field.label, type: field.type };
  });
}

export async function saveCategory(ctx: RequestContext, id: string | null, input: CategoryInput) {
  const companyId = requireCompany(ctx);
  const fields = cleanFields(input.fields);
  await db.$transaction(async (tx) => {
    const clash = await tx.assetCategory.findFirst({ where: { companyId, deletedAt: null, name: { equals: input.name, mode: "insensitive" }, NOT: id ? { id } : undefined } });
    if (clash) throw conflict(`There's already a category called ${clash.name}`);
    if (id) {
      const before = await tx.assetCategory.findFirst({ where: { id, companyId, deletedAt: null } });
      if (!before) throw notFound("That category isn't there any more");
      await tx.assetCategory.update({ where: { id }, data: { name: input.name, fields: fields as unknown as Prisma.InputJsonValue } });
      if (input.routines) await syncRoutines(tx, companyId, id, input.routines);
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetCategory", entityId: id, action: "updated", diff: { name: input.name, fields: fields.map((field) => field.label), routines: input.routines?.map((routine) => routine.name), before: { name: before.name } } });
    } else {
      const last = await tx.assetCategory.aggregate({ where: { companyId }, _max: { sort: true } });
      const row = await tx.assetCategory.create({ data: { companyId, name: input.name, fields: fields as unknown as Prisma.InputJsonValue, sort: (last._max.sort ?? 0) + 1 } });
      if (input.routines?.length) await syncRoutines(tx, companyId, row.id, input.routines);
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetCategory", entityId: row.id, action: "created", diff: { name: input.name, fields: fields.map((field) => field.label), routines: input.routines?.map((routine) => routine.name) } });
    }
  });
  return listCategories(ctx);
}

/** Removes a category. Its assets stay, without a category. */
export async function deleteCategory(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const before = await db.assetCategory.findFirst({ where: { id, companyId, deletedAt: null } });
  if (!before) throw notFound("That category isn't there any more");
  await db.$transaction(async (tx) => {
    const assets = await tx.asset.findMany({ where: { companyId, categoryId: id }, select: { id: true } });
    const moved = await tx.asset.updateMany({ where: { companyId, categoryId: id }, data: { categoryId: null } });
    await tx.assetCategory.update({ where: { id }, data: { deletedAt: new Date() } });
    await tx.assetRoutine.updateMany({ where: { categoryId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    for (const asset of assets) await refreshDue(tx, asset.id);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetCategory", entityId: id, action: "deleted", diff: { name: before.name, assets: moved.count } });
  });
  return listCategories(ctx);
}

/** The starting set for the business's trade, minus the names it already has. */
export async function categoryPresets(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const [company, have] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId }, select: { tradeProfile: true } }),
    db.assetCategory.findMany({ where: { companyId, deletedAt: null }, select: { name: true } }),
  ]);
  const taken = new Set(have.map((row) => row.name.toLowerCase()));
  return presetCategories(tradePreset(company.tradeProfile)).filter((preset) => !taken.has(preset.name.toLowerCase()));
}

export async function addPresets(ctx: RequestContext, names: string[]) {
  const companyId = requireCompany(ctx);
  const presets = (await categoryPresets(ctx)).filter((preset) => names.includes(preset.name));
  if (!presets.length) throw badRequest("Those categories are already there");
  await db.$transaction(async (tx) => {
    const last = await tx.assetCategory.aggregate({ where: { companyId }, _max: { sort: true } });
    let sort = last._max.sort ?? 0;
    for (const preset of presets) {
      const row = await tx.assetCategory.create({ data: { companyId, name: preset.name, fields: preset.fields as unknown as Prisma.InputJsonValue, sort: ++sort } });
      for (const [index, routine] of preset.routines.entries()) await tx.assetRoutine.create({ data: { companyId, categoryId: row.id, name: routine.name, everyMonths: routine.everyMonths, mustPass: routine.mustPass, sort: index + 1 } });
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetCategory", entityId: row.id, action: "created", diff: { name: preset.name, from: "starting set" } });
    }
  });
  return listCategories(ctx);
}
