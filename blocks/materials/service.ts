// Public service API of the materials block (core, docs/materials-block.md §1):
// the business's own list of the things it installs, their brands and families.
// Quotes' price list items point at a material and add the money; the Handover
// Block lists materials per job.

import { app, conflict, notFound, requireCompany, type RequestContext } from "@grid/core";
import { attachFile, audit, db, purgeStoredFile, type Prisma, type Tx } from "@grid/db";
import { tradeForCompany } from "./trades";
import { priceBookName } from "./words";
import type { BrandInput, BrandSupportInput, ListQuery, MaterialInput, SameQuery } from "./validation";

const MOD = "materials";

export interface MaterialRow {
  id: string;
  name: string;
  itemType: string | null;
  brandId: string | null;
  brand: string | null;
  familyId: string | null;
  family: string | null;
  model: string | null;
  finish: string | null;
  size: string | null;
  link: string | null;
  trade: string;
  photoFileId: string | null;
  swatch: string | null;
  notes: string | null;
  /** Removed from the list (kept for the price list and jobs that use it). */
  removed: boolean;
}

/**
 * Payload of "materials.changed": the price list keeps each material item's
 * name ("Iconic double switch, White") in step with its material.
 */
export interface MaterialChangedEvent {
  companyId: string;
  materialId: string;
  /** priceBookName(): the name with its finish. */
  name: string;
}

const include = {
  brand: { select: { name: true, deletedAt: true } },
  family: { select: { name: true, deletedAt: true } },
} as const;
type MaterialRecord = Prisma.MaterialGetPayload<{ include: typeof include }>;

function toRow(material: MaterialRecord): MaterialRow {
  const brand = material.brand && !material.brand.deletedAt ? material.brand : null;
  const family = material.family && !material.family.deletedAt ? material.family : null;
  return {
    id: material.id,
    name: material.name,
    itemType: material.itemType,
    brandId: brand ? material.brandId : null,
    brand: brand?.name ?? null,
    familyId: family ? material.familyId : null,
    family: family?.name ?? null,
    model: material.model,
    finish: material.finish,
    size: material.size,
    link: material.link,
    trade: material.trade,
    photoFileId: material.photoFileId,
    swatch: material.swatch,
    notes: material.notes,
    removed: !!material.deletedAt,
  };
}

const words = (query: string | undefined) => (query ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
const insensitive = (value: string) => ({ equals: value, mode: "insensitive" as const });

/** Which materials match a search: name, type, brand, family, model or finish. */
export function materialSearch(query: string | undefined): Prisma.MaterialWhereInput[] {
  return words(query).map((word) => ({
    OR: [
      { name: { contains: word, mode: "insensitive" as const } },
      { itemType: { contains: word, mode: "insensitive" as const } },
      { model: { contains: word, mode: "insensitive" as const } },
      { finish: { contains: word, mode: "insensitive" as const } },
      { brand: { name: { contains: word, mode: "insensitive" as const }, deletedAt: null } },
      { family: { name: { contains: word, mode: "insensitive" as const }, deletedAt: null } },
    ],
  }));
}

export async function listMaterials(ctx: RequestContext, options: ListQuery = {}): Promise<MaterialRow[]> {
  const companyId = requireCompany(ctx);
  const rows = await db.material.findMany({
    where: {
      companyId,
      deletedAt: null,
      ...(options.trade ? { trade: options.trade } : {}),
      ...(options.family ? { familyId: options.family } : {}),
      ...(options.brand === "none"
        ? { OR: [{ brandId: null }, { brand: { deletedAt: { not: null } } }] }
        : options.brand
          ? { brandId: options.brand, brand: { deletedAt: null } }
          : {}),
      AND: materialSearch(options.q),
    },
    include,
    orderBy: [{ name: "asc" }, { finish: "asc" }],
    take: 500,
  });
  return rows.map(toRow);
}

/** One material, removed ones too (a price list item or job may still name it). */
export async function getMaterial(ctx: RequestContext, id: string): Promise<MaterialRow> {
  const companyId = requireCompany(ctx);
  const row = await db.material.findFirst({ where: { id, companyId }, include });
  if (!row) throw notFound("Material not found");
  return toRow(row);
}

/** Materials by id, for other Blocks' lists (removed ones included). */
export async function materialsById(ctx: RequestContext, ids: string[]): Promise<Map<string, MaterialRow>> {
  const companyId = requireCompany(ctx);
  if (!ids.length) return new Map();
  const rows = await db.material.findMany({ where: { companyId, id: { in: [...new Set(ids)] } }, include });
  return new Map(rows.map((row) => [row.id, toRow(row)]));
}

/**
 * A business's materials by id without a signed-in person: the handover
 * PDF made in the background and the client's handover link.
 */
export async function materialsForCompany(companyId: string, ids: string[]): Promise<Map<string, MaterialRow>> {
  if (!ids.length) return new Map();
  const rows = await db.material.findMany({ where: { companyId, id: { in: [...new Set(ids)] } }, include });
  return new Map(rows.map((row) => [row.id, toRow(row)]));
}

/** Ids of the business's materials matching a search or a brand, for other Blocks' filters. */
export async function materialIdsMatching(ctx: RequestContext, options: { q?: string; brand?: string }): Promise<string[]> {
  const companyId = requireCompany(ctx);
  const rows = await db.material.findMany({
    where: {
      companyId,
      ...(options.brand === "none"
        ? { OR: [{ brandId: null }, { brand: { deletedAt: { not: null } } }] }
        : options.brand
          ? { brandId: options.brand, brand: { deletedAt: null } }
          : {}),
      AND: materialSearch(options.q),
    },
    select: { id: true },
    take: 2000,
  });
  return rows.map((row) => row.id);
}

/** A material of this business that can be picked (not removed), or 404. */
export async function requireMaterial(ctx: RequestContext, id: string, tx: Tx = db): Promise<MaterialRow> {
  const companyId = requireCompany(ctx);
  const row = await tx.material.findFirst({ where: { id, companyId, deletedAt: null }, include });
  if (!row) throw notFound("Material not found");
  return toRow(row);
}

/** The material page: the material and the rest of its family. */
export async function materialPage(ctx: RequestContext, id: string) {
  const material = await getMaterial(ctx, id);
  const family = material.familyId ? (await listMaterials(ctx, { family: material.familyId })).filter((other) => other.id !== id) : [];
  return { material, family };
}

/** What the form suggests as you type: item types, finishes and family names already used, and the trade new materials start with. */
export async function suggestions(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const [types, finishes, families, trade] = await Promise.all([
    db.material.findMany({ where: { companyId, deletedAt: null, itemType: { not: null } }, distinct: ["itemType"], select: { itemType: true }, orderBy: { itemType: "asc" }, take: 300 }),
    db.material.findMany({ where: { companyId, deletedAt: null, finish: { not: null } }, distinct: ["finish"], select: { finish: true }, orderBy: { finish: "asc" }, take: 300 }),
    db.materialFamily.findMany({ where: { companyId, deletedAt: null }, select: { name: true }, orderBy: { name: "asc" }, take: 500 }),
    defaultTrade(ctx),
  ]);
  return {
    trade,
    itemTypes: types.map((row) => row.itemType!),
    finishes: finishes.map((row) => row.finish!),
    families: families.map((row) => row.name),
  };
}

/** The trade new materials start with: the business's own. */
export async function defaultTrade(ctx: RequestContext): Promise<string> {
  const companyId = requireCompany(ctx);
  const company = await db.company.findUnique({ where: { id: companyId }, select: { tradeProfile: true } });
  return tradeForCompany(company?.tradeProfile);
}

/**
 * A material already in the list that looks the same: same brand, same model
 * (or the same name when there's no model) and the same finish. Grid warns
 * about it but doesn't stop you (docs/materials-block.md §1).
 */
export async function sameMaterial(ctx: RequestContext, query: SameQuery): Promise<MaterialRow | null> {
  const companyId = requireCompany(ctx);
  const model = query.model?.trim();
  const finish = query.finish?.trim();
  const row = await db.material.findFirst({
    where: {
      companyId,
      deletedAt: null,
      ...(query.not ? { id: { not: query.not } } : {}),
      brandId: query.brandId ?? null,
      AND: [
        model ? { model: insensitive(model) } : { name: insensitive(query.name.trim()), model: null },
        finish ? { finish: insensitive(finish) } : { finish: null },
      ],
    },
    include,
  });
  return row ? toRow(row) : null;
}

/** An existing family with this name, or a new one. */
async function familyId(tx: Tx, companyId: string, name: string | null): Promise<string | null> {
  if (!name) return null;
  const found = await tx.materialFamily.findFirst({ where: { companyId, deletedAt: null, name: insensitive(name) }, select: { id: true } });
  if (found) return found.id;
  return (await tx.materialFamily.create({ data: { companyId, name }, select: { id: true } })).id;
}

async function emitChanged(ctx: RequestContext, row: MaterialRow) {
  const companyId = requireCompany(ctx);
  const payload: MaterialChangedEvent = { companyId, materialId: row.id, name: priceBookName(row) };
  await app().events.emit("materials.changed", payload, { emittedBy: MOD, companyId, actorId: ctx.userId });
}

export async function saveMaterial(ctx: RequestContext, id: string | null, input: MaterialInput): Promise<MaterialRow> {
  const companyId = requireCompany(ctx);
  const saved = await db.$transaction(async (tx) => {
    if (input.brandId && !(await tx.materialBrand.count({ where: { id: input.brandId, companyId, deletedAt: null } }))) throw notFound("Brand not found");
    const before = id ? await tx.material.findFirst({ where: { id, companyId, deletedAt: null } }) : null;
    if (id && !before) throw notFound("Material not found");
    // A new photo is attached to this Block; one replaced or taken off goes straight away.
    if (input.photoFileId && input.photoFileId !== before?.photoFileId) await attachFile(tx, input.photoFileId, { companyId, userId: ctx.userId, blockId: MOD });
    if (before?.photoFileId && before.photoFileId !== input.photoFileId) await purgeStoredFile(tx, before.photoFileId);
    const { family, ...fields } = input;
    const data = { ...fields, familyId: await familyId(tx, companyId, family) };
    const row = id
      ? await tx.material.update({ where: { id }, data, include })
      : await tx.material.create({ data: { companyId, ...data }, include });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Material", entityId: row.id, action: id ? "updated" : "created", diff: input as Prisma.InputJsonValue });
    return toRow(row);
  });
  await emitChanged(ctx, saved);
  return saved;
}

/**
 * Removes a material from the list. It's kept (with its photo) for price list
 * items, quotes and jobs that already use it.
 */
export async function deleteMaterial(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const row = await tx.material.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!row) throw notFound("Material not found");
    await tx.material.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Material", entityId: id, action: "deleted", diff: { name: row.name, finish: row.finish } });
  });
  return { id, deleted: true };
}

/** /api/files asks this: a material's photo is seen by anyone in the business who can see materials. */
export async function canReadMaterialFile(ctx: RequestContext, fileId: string): Promise<boolean> {
  if (!ctx.companyId || !ctx.permissions.has("materials.view")) return false;
  return !!(await db.material.findFirst({ where: { companyId: ctx.companyId, photoFileId: fileId }, select: { id: true } }));
}

// Brands (Clipsal, HPM…): a list per business that materials pick from.

export interface BrandRow {
  id: string;
  name: string;
  /** How many materials use it. */
  materials: number;
}

/** The business's brands, A–Z, with how many materials use each. */
export async function listBrands(ctx: RequestContext): Promise<BrandRow[]> {
  const companyId = requireCompany(ctx);
  const brands = await db.materialBrand.findMany({
    where: { companyId, deletedAt: null },
    include: { _count: { select: { materials: { where: { deletedAt: null } } } } },
    orderBy: { name: "asc" },
  });
  return brands.map((brand) => ({ id: brand.id, name: brand.name, materials: brand._count.materials }));
}

export async function saveBrand(ctx: RequestContext, id: string | null, input: BrandInput) {
  const companyId = requireCompany(ctx);
  const brand = await db.$transaction(async (tx) => {
    const same = await tx.materialBrand.findFirst({ where: { companyId, deletedAt: null, name: insensitive(input.name), ...(id ? { id: { not: id } } : {}) } });
    if (same) throw conflict(`There's already a brand called ${same.name}.`);
    let row;
    if (id) {
      const result = await tx.materialBrand.updateMany({ where: { id, companyId, deletedAt: null }, data: { name: input.name } });
      if (!result.count) throw notFound("Brand not found");
      row = await tx.materialBrand.findUniqueOrThrow({ where: { id } });
    } else {
      row = await tx.materialBrand.create({ data: { companyId, name: input.name } });
    }
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "MaterialBrand", entityId: row.id, action: id ? "updated" : "created", diff: { name: input.name } });
    return { id: row.id, name: row.name };
  });
  return brand;
}

/** A brand with the maker's support details (the assets page's brand card). */
export interface BrandDetails {
  id: string;
  name: string;
  website: string | null;
  supportUrl: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  notes: string | null;
}

const details = (row: BrandDetails): BrandDetails => ({
  id: row.id,
  name: row.name,
  website: row.website,
  supportUrl: row.supportUrl,
  supportPhone: row.supportPhone,
  supportEmail: row.supportEmail,
  notes: row.notes,
});

/** Brands by id, with their support details (for other Blocks' pages). */
export async function brandsById(companyId: string, ids: string[]): Promise<Map<string, BrandDetails>> {
  if (!ids.length) return new Map();
  const rows = await db.materialBrand.findMany({ where: { companyId, id: { in: [...new Set(ids)] }, deletedAt: null } });
  return new Map(rows.map((row) => [row.id, details(row)]));
}

/**
 * The brand with this name, made when there isn't one yet (typing a new
 * make on an asset adds it to the list, as Docket does). Inside the
 * caller's transaction. Null for a blank name.
 */
export async function brandForName(tx: Tx, companyId: string, userId: string, name: string | null): Promise<string | null> {
  const clean = name?.trim();
  if (!clean) return null;
  const same = await tx.materialBrand.findFirst({ where: { companyId, deletedAt: null, name: insensitive(clean) }, select: { id: true } });
  if (same) return same.id;
  const row = await tx.materialBrand.create({ data: { companyId, name: clean.slice(0, 60) } });
  await audit(tx, { blockId: MOD, actorId: userId, companyId, entityType: "MaterialBrand", entityId: row.id, action: "created", diff: { name: row.name, from: "an asset" } });
  return row.id;
}

/** Sets the maker's support site, phone, email and notes, once for every asset of the brand. */
export async function saveBrandSupport(ctx: RequestContext, id: string, input: BrandSupportInput): Promise<BrandDetails> {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const before = await tx.materialBrand.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!before) throw notFound("Brand not found");
    const row = await tx.materialBrand.update({ where: { id }, data: input });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "MaterialBrand", entityId: id, action: "updated", diff: { name: row.name, ...input } });
    return details(row);
  });
}

/** Removes a brand from the list. Its materials stay, without a brand. */
export async function deleteBrand(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const brand = await tx.materialBrand.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!brand) throw notFound("Brand not found");
    await tx.materialBrand.update({ where: { id }, data: { deletedAt: new Date() } });
    const materials = await tx.material.updateMany({ where: { brandId: id, companyId }, data: { brandId: null } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "MaterialBrand", entityId: id, action: "deleted", diff: { name: brand.name, materials: materials.count } });
  });
  return { id, deleted: true };
}
