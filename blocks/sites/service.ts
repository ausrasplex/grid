// Public service API of the sites block (core).
//
// A company sees a site when it owns it or has a SiteCompanyState row for
// it (the projects block adds one when the company starts a job there).
// Structure (buildings and levels) can only be changed by the owner company
// for now; site editors, proposals and claims come in 2b.

import {
  addressColumns,
  addressFromColumns,
  addressSelect,
  app,
  badRequest,
  conflict,
  forbidden,
  formatAddress,
  notFound,
  requireCompany,
  type Address,
  type RequestContext,
} from "@grid/core";
import { audit, db, ensureRouteCode, type Prisma, type Tx } from "@grid/db";
import { addressKey, basementAsParking, levelKey, levelLabel, levelNameClashes, levelShortName, siteNameFromAddress, uniqueShortName } from "./address";
import type { AddBuildingInput, AddLevelsInput, CreateSiteInput, SiteNoteInput, UpdateSiteInput } from "./validation";

const MOD = "sites";

/** A site's address columns: the parts, the one line made from them, and the key for matching. */
export function siteAddressColumns(address: Address) {
  const columns = addressColumns(address);
  const line = columns.address ?? "";
  return { ...columns, address: line, addressKey: addressKey(line) };
}

type SiteRow = Prisma.SiteGetPayload<{ include: { buildings: { include: { levels: true } } } }>;

async function emit(event: string, payload: unknown, ctx: { companyId: string | null; userId: string | null }) {
  await app().events.emit(event, payload, { emittedBy: MOD, companyId: ctx.companyId, actorId: ctx.userId });
}

const structureInclude = {
  buildings: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], include: { levels: { orderBy: { order: "desc" } } } },
} satisfies Prisma.SiteInclude;

/** The site if this company may see it, else 404 (never reveals that it exists). */
async function visibleSite(tx: Tx, companyId: string, siteId: string): Promise<SiteRow> {
  const site = await tx.site.findFirst({
    where: {
      id: siteId,
      deletedAt: null,
      OR: [{ ownerCompanyId: companyId }, { states: { some: { companyId } } }],
    },
    include: structureInclude,
  });
  if (!site) throw notFound("Site not found");
  return site;
}

function assertOwner(ctx: RequestContext, site: { ownerCompanyId: string }) {
  if (site.ownerCompanyId !== ctx.companyId) {
    throw forbidden("Only the company that looks after this site can change its buildings and levels");
  }
}

// ---------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------

export interface SiteStructure {
  id: string;
  kind: "MANAGED" | "PRIVATE";
  name: string;
  /** The one line: "12 Smith St, Brunswick VIC 3056". */
  address: string;
  addressParts: Address;
  /** Site notes, in order. */
  notes: SiteNoteView[];
  ownerCompanyId: string;
  /** True when this company looks after the structure. */
  ownedByMe: boolean;
  archivedAt: Date | null;
  activeJobs: number;
  totalJobs: number;
  buildings: {
    id: string;
    name: string;
    kind: "MULTI" | "SINGLE";
    levels: {
      id: string;
      name: string;
      shortName: string;
      /** What it's used for ("Plant room"), or null. */
      use: string | null;
      /** "Level 40 · Plant room": the name with its use. */
      label: string;
      order: number;
    }[];
  }[];
}

export async function getSite(ctx: RequestContext, siteId: string, tx: Tx = db): Promise<SiteStructure> {
  const companyId = requireCompany(ctx);
  const site = await visibleSite(tx, companyId, siteId);
  const state = await tx.siteCompanyState.findUnique({ where: { siteId_companyId: { siteId, companyId } } });
  return {
    id: site.id,
    kind: site.kind,
    name: site.name,
    address: site.address,
    addressParts: addressFromColumns(site),
    notes: await notesFor(tx, siteId),
    ownerCompanyId: site.ownerCompanyId,
    ownedByMe: site.ownerCompanyId === companyId,
    archivedAt: state?.archivedAt ?? null,
    activeJobs: state?.activeJobs ?? 0,
    totalJobs: state?.totalJobs ?? 0,
    buildings: site.buildings.map((building) => ({
      id: building.id,
      name: building.name,
      kind: building.kind,
      levels: building.levels.map((level) => ({ id: level.id, name: level.name, shortName: level.shortName, use: level.use, label: levelLabel(level), order: level.order })),
    })),
  };
}

export type SitesTab = "active" | "mine" | "archived";

export interface SiteListRow {
  id: string;
  name: string;
  address: string;
  addressParts: Address;
  kind: "MANAGED" | "PRIVATE";
  activeJobs: number;
  totalJobs: number;
  buildings: number;
  archivedAt: Date | null;
  lastOpenedAt: Date | null;
}

/**
 * The Sites list (docs/navigation.md §4): Active · Mine · Archived, searched
 * by site name, address or customer, most recently opened first.
 * "Mine" = sites you've opened. (From phase 7 it becomes sites with a job you're on.)
 */
export async function listSites(ctx: RequestContext, options: { tab?: SitesTab; q?: string; limit?: number } = {}): Promise<SiteListRow[]> {
  const companyId = requireCompany(ctx);
  const tab = options.tab ?? "active";
  const words = (options.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);

  const mine = await db.userSiteLocation.findMany({
    where: { userId: ctx.userId, companyId },
    select: { siteId: true, updatedAt: true },
  });
  const opened = new Map(mine.map((visit) => [visit.siteId, visit.updatedAt]));

  const states = await db.siteCompanyState.findMany({
    where: {
      companyId,
      archivedAt: tab === "archived" ? { not: null } : null,
      ...(tab === "mine" ? { siteId: { in: [...opened.keys()] } } : {}),
      site: { deletedAt: null },
      AND: words.map((word) => ({
        OR: [
          { keywords: { contains: word, mode: "insensitive" as const } },
          { site: { name: { contains: word, mode: "insensitive" as const } } },
          { site: { address: { contains: word, mode: "insensitive" as const } } },
        ],
      })),
    },
    include: { site: { select: { id: true, name: true, ...addressSelect, kind: true, _count: { select: { buildings: true } } } } },
    orderBy: { lastActivityAt: "desc" },
    take: 300,
  });

  const rows = states.map((state) => ({
    id: state.site.id,
    name: state.site.name,
    address: state.site.address,
    addressParts: addressFromColumns(state.site),
    kind: state.site.kind,
    activeJobs: state.activeJobs,
    totalJobs: state.totalJobs,
    buildings: state.site._count.buildings,
    archivedAt: state.archivedAt,
    lastOpenedAt: opened.get(state.siteId) ?? null,
    lastActivityAt: state.lastActivityAt,
  }));
  // Most recently opened first, then most recent activity.
  rows.sort(
    (first, second) =>
      (second.lastOpenedAt?.getTime() ?? 0) - (first.lastOpenedAt?.getTime() ?? 0) || second.lastActivityAt.getTime() - first.lastActivityAt.getTime(),
  );
  return rows.slice(0, options.limit ?? 100).map(({ lastActivityAt: _, ...site }) => site);
}

// ---------------------------------------------------------------------
// Creating sites
// ---------------------------------------------------------------------

/** A managed site (precinct, centre, school). Buildings and levels are added after. */
export async function createManagedSite(ctx: RequestContext, input: CreateSiteInput) {
  const companyId = requireCompany(ctx);
  const site = await db.$transaction(async (tx) => {
    const site = await tx.site.create({
      data: {
        kind: "MANAGED",
        ownerCompanyId: companyId,
        name: input.name,
        ...siteAddressColumns(input.address),
        createdById: ctx.userId,
      },
    });
    await tx.siteCompanyState.create({ data: { siteId: site.id, companyId } });
    await ensureRouteCode(tx, { blockId: MOD, entityType: "Site", entityId: site.id, companyId, createdById: ctx.userId });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Site", entityId: site.id, action: "created", diff: { kind: "MANAGED", name: input.name, address: formatAddress(input.address) } });
    return site;
  });
  await emit("sites.created", { siteId: site.id, kind: site.kind }, ctx);
  return site;
}

/**
 * The private site for a job address (docs/stage-2-projects.md §1e).
 * Reuses this company's site at the same address, including an archived
 * one (the caller's job reactivates it), instead of making a duplicate.
 * A new one gets a single-level building called "House".
 */
export async function findOrCreatePrivateSite(
  tx: Tx,
  input: { companyId: string; userId: string; address: Address; name?: string },
): Promise<{ siteId: string; buildingId: string; created: boolean; wasArchived: boolean }> {
  const columns = siteAddressColumns(input.address);
  const key = columns.addressKey;
  const existing = await tx.site.findFirst({
    where: { ownerCompanyId: input.companyId, addressKey: key, deletedAt: null },
    include: { buildings: { orderBy: { order: "asc" }, take: 1 } },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    const state = await tx.siteCompanyState.findUnique({
      where: { siteId_companyId: { siteId: existing.id, companyId: input.companyId } },
    });
    let buildingId = existing.buildings[0]?.id;
    if (!buildingId) {
      buildingId = (await tx.building.create({ data: { siteId: existing.id, name: "House", kind: "SINGLE" } })).id;
    }
    return { siteId: existing.id, buildingId, created: false, wasArchived: !!state?.archivedAt };
  }

  const site = await tx.site.create({
    data: {
      kind: "PRIVATE",
      ownerCompanyId: input.companyId,
      name: input.name?.trim() || siteNameFromAddress(columns.address),
      ...columns,
      createdById: input.userId,
    },
  });
  const building = await tx.building.create({ data: { siteId: site.id, name: "House", kind: "SINGLE" } });
  await tx.siteCompanyState.create({ data: { siteId: site.id, companyId: input.companyId } });
  await ensureRouteCode(tx, { blockId: MOD, entityType: "Site", entityId: site.id, companyId: input.companyId, createdById: input.userId });
  await audit(tx, {
    blockId: MOD,
    actorId: input.userId,
    companyId: input.companyId,
    entityType: "Site",
    entityId: site.id,
    action: "created",
    diff: { kind: "PRIVATE", address: columns.address, auto: true },
  });
  return { siteId: site.id, buildingId: building.id, created: true, wasArchived: false };
}

/**
 * Called by the projects block whenever a company's jobs at a site change.
 * Archives the site for that company when its last active job closes, and
 * reactivates it when a new one starts.
 */
export async function syncCompanySite(
  tx: Tx,
  input: { siteId: string; companyId: string; activeJobs: number; totalJobs: number; keywords: string; actorId: string | null },
) {
  const state = await tx.siteCompanyState.findUnique({ where: { siteId_companyId: { siteId: input.siteId, companyId: input.companyId } } });
  const archive = input.activeJobs === 0 && input.totalJobs > 0;
  const archivedAt = archive ? (state?.archivedAt ?? new Date()) : null;
  await tx.siteCompanyState.upsert({
    where: { siteId_companyId: { siteId: input.siteId, companyId: input.companyId } },
    create: { siteId: input.siteId, companyId: input.companyId, activeJobs: input.activeJobs, totalJobs: input.totalJobs, keywords: input.keywords, archivedAt },
    update: { activeJobs: input.activeJobs, totalJobs: input.totalJobs, keywords: input.keywords, archivedAt, lastActivityAt: new Date() },
  });
  const was = !!state?.archivedAt;
  if (was !== !!archivedAt) {
    await audit(tx, {
      blockId: MOD,
      actorId: input.actorId,
      companyId: input.companyId,
      entityType: "Site",
      entityId: input.siteId,
      action: archivedAt ? "archived" : "reactivated",
    });
  }
}

// ---------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------

export async function updateSite(ctx: RequestContext, siteId: string, input: UpdateSiteInput) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const site = await visibleSite(tx, companyId, siteId);
    // Name and address belong to the company that looks after the site.
    if (site.ownerCompanyId !== companyId) {
      throw forbidden("Only the company that looks after this site can change its name or address");
    }
    const columns = input.address ? siteAddressColumns(input.address) : null;
    if (columns && columns.addressKey !== site.addressKey) {
      // Two of your sites at one address would split its jobs: say which one it is instead.
      const other = await tx.site.findFirst({ where: { ownerCompanyId: companyId, addressKey: columns.addressKey, deletedAt: null, id: { not: siteId } }, select: { name: true } });
      if (other) throw conflict(`You already have a site at that address: ${other.name}`);
    }
    // A house named after its address ("12 Smith St") follows the address, unless a new name was given.
    const autoName = site.name === siteNameFromAddress(site.address);
    const name = input.name ?? (columns && autoName ? siteNameFromAddress(columns.address) : undefined);
    const updated = await tx.site.update({
      where: { id: siteId },
      data: { name, ...(columns ?? {}) },
    });
    const diff = {
      ...(name !== undefined && name !== site.name ? { name: { from: site.name, to: name } } : {}),
      ...(columns && columns.address !== site.address ? { address: { from: site.address, to: columns.address } } : {}),
    };
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Site", entityId: siteId, action: "updated", diff: diff as Prisma.InputJsonValue });
    return getSite(ctx, updated.id, tx);
  });
}

// ---------------------------------------------------------------------
// Site notes: titled notes kept with the address
// ---------------------------------------------------------------------

export interface SiteNoteView {
  id: string;
  title: string;
  body: string;
  /** Who last changed it (null for notes from before they were kept), and when. */
  by: string | null;
  at: Date;
}

async function notesFor(tx: Tx, siteId: string): Promise<SiteNoteView[]> {
  const rows = await tx.siteNote.findMany({ where: { siteId, deletedAt: null }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
  const people = await tx.user.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.updatedById ?? row.createdById ?? ""))] } },
    select: { id: true, name: true },
  });
  const name = new Map(people.map((person) => [person.id, person.name]));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    by: name.get(row.updatedById ?? row.createdById ?? "") ?? null,
    at: row.updatedAt,
  }));
}

/** A note on a site this company can see, or 404. */
async function visibleNote(tx: Tx, companyId: string, noteId: string) {
  const note = await tx.siteNote.findFirst({ where: { id: noteId, deletedAt: null } });
  if (!note) throw notFound("Note not found");
  await visibleSite(tx, companyId, note.siteId);
  return note;
}

export async function siteNotes(ctx: RequestContext, siteId: string): Promise<SiteNoteView[]> {
  const companyId = requireCompany(ctx);
  await visibleSite(db, companyId, siteId);
  return notesFor(db, siteId);
}

/** Adds a note at the end. Returns the site's notes. */
export async function addSiteNote(ctx: RequestContext, siteId: string, input: SiteNoteInput): Promise<SiteNoteView[]> {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    await visibleSite(tx, companyId, siteId);
    const last = await tx.siteNote.findFirst({ where: { siteId, deletedAt: null }, orderBy: { sort: "desc" }, select: { sort: true } });
    const note = await tx.siteNote.create({
      data: { siteId, companyId, title: input.title, body: input.body, sort: (last?.sort ?? -1) + 1, createdById: ctx.userId, updatedById: ctx.userId },
    });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "SiteNote", entityId: note.id, action: "added", diff: { siteId, title: input.title } });
    return notesFor(tx, siteId);
  });
}

export async function updateSiteNote(ctx: RequestContext, noteId: string, input: SiteNoteInput): Promise<SiteNoteView[]> {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const note = await visibleNote(tx, companyId, noteId);
    await tx.siteNote.update({ where: { id: noteId }, data: { title: input.title, body: input.body, updatedById: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "SiteNote", entityId: noteId, action: "updated", diff: { before: { title: note.title, body: note.body } } });
    return notesFor(tx, note.siteId);
  });
}

export async function deleteSiteNote(ctx: RequestContext, noteId: string): Promise<SiteNoteView[]> {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const note = await visibleNote(tx, companyId, noteId);
    await tx.siteNote.update({ where: { id: noteId }, data: { deletedAt: new Date(), deletedById: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "SiteNote", entityId: noteId, action: "deleted", diff: { title: note.title, body: note.body } });
    return notesFor(tx, note.siteId);
  });
}

/** Puts the site's notes in this order (ids not on the site are ignored; missing ones go last). */
export async function orderSiteNotes(ctx: RequestContext, siteId: string, ids: string[]): Promise<SiteNoteView[]> {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    await visibleSite(tx, companyId, siteId);
    const notes = await tx.siteNote.findMany({ where: { siteId, deletedAt: null }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }], select: { id: true } });
    const onSite = new Set(notes.map((note) => note.id));
    const order = [...new Set(ids.filter((id) => onSite.has(id))), ...notes.map((note) => note.id).filter((id) => !ids.includes(id))];
    for (const [index, id] of order.entries()) await tx.siteNote.update({ where: { id }, data: { sort: index } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Site", entityId: siteId, action: "notes_reordered", diff: { order } });
    return notesFor(tx, siteId);
  });
}

export async function addBuilding(ctx: RequestContext, siteId: string, input: AddBuildingInput) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const site = await visibleSite(tx, companyId, siteId);
    assertOwner(ctx, site);
    const order = (site.buildings.at(-1)?.order ?? -1) + 1;
    const building = await tx.building.create({ data: { siteId, name: input.name, kind: input.kind, order } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Building", entityId: building.id, action: "created", diff: { siteId, ...input } });
    return building;
  });
}

async function ownedBuilding(tx: Tx, ctx: RequestContext, buildingId: string) {
  const companyId = requireCompany(ctx);
  const building = await tx.building.findUnique({ where: { id: buildingId }, include: { levels: { orderBy: { order: "desc" } } } });
  if (!building) throw notFound("Building not found");
  const site = await visibleSite(tx, companyId, building.siteId);
  assertOwner(ctx, site);
  return { building, site, companyId };
}

export async function renameBuilding(ctx: RequestContext, buildingId: string, name: string) {
  return db.$transaction(async (tx) => {
    const { companyId, building } = await ownedBuilding(tx, ctx, buildingId);
    await tx.building.update({ where: { id: buildingId }, data: { name } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Building", entityId: buildingId, action: "renamed", diff: { from: building.name, to: name } });
    return { id: buildingId };
  });
}

/**
 * Single-level → multi-level (a second storey, say). Its existing work moves
 * to "Ground": jobs that covered the whole building still do.
 */
export async function convertToMultiLevel(ctx: RequestContext, buildingId: string) {
  const result = await db.$transaction(async (tx) => {
    const { companyId, building } = await ownedBuilding(tx, ctx, buildingId);
    if (building.kind === "MULTI") throw badRequest("This building already has levels");
    await tx.building.update({ where: { id: buildingId }, data: { kind: "MULTI" } });
    const ground = await tx.level.create({ data: { buildingId, name: "Ground", shortName: "G", order: 0 } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Building", entityId: buildingId, action: "converted_to_multi_level", diff: { groundLevelId: ground.id } });
    return { buildingId, groundLevelId: ground.id, companyId };
  });
  // Later blocks (photos, plans, tasks) move items with no level onto Ground.
  await emit("sites.building.converted", { buildingId: result.buildingId, groundLevelId: result.groundLevelId }, ctx);
  return { buildingId: result.buildingId, groundLevelId: result.groundLevelId };
}

/** Adds levels above the top floor or below the bottom one. Names are given top first. */
export async function addLevels(ctx: RequestContext, buildingId: string, input: AddLevelsInput) {
  return db.$transaction(async (tx) => {
    const { companyId, building } = await ownedBuilding(tx, ctx, buildingId);
    if (building.kind === "SINGLE") throw badRequest("Give this building levels first (it's single-level)");
    const top = building.levels[0]?.order;
    const bottom = building.levels.at(-1)?.order;
    const count = input.names.length;
    // Every level in a building needs its own name.
    const clashes = levelNameClashes(
      building.levels.map((level) => level.name),
      input.names,
    );
    if (clashes.length) {
      const list = clashes.map((name) => `"${name}"`).join(", ");
      throw conflict(
        clashes.length === 1
          ? `${building.name} already has a level called ${list}. Give each level its own name.`
          : `${building.name} already has levels called ${list} (or they're in the list twice). Give each level its own name.`,
      );
    }
    const shorts = building.levels.map((level) => level.shortName);
    // Orders for the new levels, highest first.
    const start = input.position === "below" ? (bottom ?? count) - 1 : (top ?? -1) + count;
    const created = [];
    for (let index = 0; index < count; index++) {
      const name = input.names[index]!;
      const shortName = uniqueShortName(levelShortName(name), shorts);
      shorts.push(shortName);
      // A use only makes sense for one level at a time.
      const use = count === 1 ? input.use || null : null;
      created.push(await tx.level.create({ data: { buildingId, name, shortName, use, order: start - index } }));
    }
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Building", entityId: buildingId, action: "levels_added", diff: { names: input.names, position: input.position } });
    return created.map((level) => ({ id: level.id, name: level.name }));
  });
}

async function ownedLevel(tx: Tx, ctx: RequestContext, levelId: string) {
  const level = await tx.level.findUnique({ where: { id: levelId } });
  if (!level) throw notFound("Level not found");
  const owned = await ownedBuilding(tx, ctx, level.buildingId);
  return { level, ...owned };
}

export async function updateLevel(ctx: RequestContext, levelId: string, input: { name: string; shortName?: string; use?: string | null }) {
  return db.$transaction(async (tx) => {
    const { companyId, level, building } = await ownedLevel(tx, ctx, levelId);
    const others = building.levels.filter((other) => other.id !== levelId);
    const sameName = others.find((other) => levelKey(other.name) === levelKey(input.name));
    if (sameName) throw conflict(`${building.name} already has a level called "${sameName.name}". Give each level its own name.`);
    // A short name typed in must be free; one worked out from the name is made free.
    const typedShort = input.shortName?.trim();
    const sameShort = typedShort && others.find((other) => other.shortName.toLowerCase() === typedShort.toLowerCase());
    if (sameShort) throw conflict(`"${sameShort.name}" already uses the short name "${sameShort.shortName}". Pick another.`);
    const shortName = typedShort || uniqueShortName(levelShortName(input.name), others.map((other) => other.shortName));
    await tx.level.update({ where: { id: levelId }, data: { name: input.name, shortName, ...(input.use === undefined ? {} : { use: input.use || null }) } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Level", entityId: levelId, action: "renamed", diff: { from: level.name, ...input } });
    return { id: levelId };
  });
}

/** Payload of "sites.level.deleted". */
export interface LevelDeletedEvent {
  levelId: string;
  buildingId: string;
  siteId: string;
}

/** What's filed to a level, from every block ("12 photos", "1 job covers it"). Empty when it can be deleted. */
async function usageOf(levelId: string): Promise<string[]> {
  const counts = await Promise.all(
    app()
      .registry.blocks.filter((block) => block.levelUsage)
      .map(async (block) => (await block.levelUsage!())(levelId)),
  );
  return counts.flat().filter((usage) => usage.count > 0).map((usage) => `${usage.count} ${usage.count === 1 ? usage.one : usage.many}`);
}

/** Before deleting: what's on the level (nothing means it can go). */
export async function levelUsage(ctx: RequestContext, levelId: string): Promise<{ name: string; inUse: string[] }> {
  const { level } = await ownedLevel(db, ctx, levelId);
  return { name: level.name, inUse: await usageOf(levelId) };
}

/**
 * Deletes a floor, only when nothing is filed to it: no photos, notes,
 * plan sheets or jobs covering it (Recently deleted counts too). Gone for
 * good, so nothing can come back pointing at it.
 */
export async function deleteLevel(ctx: RequestContext, levelId: string) {
  const { level, building, site, companyId } = await ownedLevel(db, ctx, levelId);
  const inUse = await usageOf(levelId);
  if (inUse.length) throw conflict(`${level.name} still has ${listWords(inUse)} on it. Move or remove them first.`);
  await db.$transaction(async (tx) => {
    await tx.userSiteLocation.updateMany({ where: { levelId }, data: { levelId: null } });
    await tx.level.delete({ where: { id: levelId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Level", entityId: levelId, action: "deleted", diff: { name: level.name, shortName: level.shortName, building: building.name } });
  });
  const payload: LevelDeletedEvent = { levelId, buildingId: building.id, siteId: site.id };
  await emit("sites.level.deleted", payload, ctx);
  return { id: levelId, deleted: true };
}

/** "a, b and c". */
function listWords(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * Turns a building's basements into car parking levels: "Basement 2" becomes
 * "Parking 2" (P2). All or nothing: refused if a new name is already taken.
 */
/** Sets (or clears) what several floors of a building are used for: "Car park" on Ground to Level 3. */
export async function setLevelsUse(ctx: RequestContext, buildingId: string, input: { levelIds?: string[]; names?: string[]; use: string | null }) {
  return db.$transaction(async (tx) => {
    const { companyId, building } = await ownedBuilding(tx, ctx, buildingId);
    const wantedNames = new Set((input.names ?? []).map(levelKey));
    const wantedIds = new Set(input.levelIds ?? []);
    const levels = building.levels.filter((level) => wantedIds.has(level.id) || wantedNames.has(levelKey(level.name)));
    if (!levels.length) throw badRequest("Those floors aren't in this building");
    const use = input.use?.trim() || null;
    await tx.level.updateMany({ where: { id: { in: levels.map((level) => level.id) } }, data: { use } });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "Building",
      entityId: buildingId,
      action: use ? "levels_used_for" : "levels_use_cleared",
      diff: { use, levels: levels.map((level) => level.name) },
    });
    return { id: buildingId, changed: levels.length };
  });
}

export async function basementsToParking(ctx: RequestContext, buildingId: string) {
  return db.$transaction(async (tx) => {
    const { companyId, building } = await ownedBuilding(tx, ctx, buildingId);
    const changes = building.levels.flatMap((level) => {
      const name = basementAsParking(level.name);
      return name ? [{ level, name }] : [];
    });
    if (!changes.length) throw badRequest(`${building.name} has no basements to change`);
    const changing = new Set(changes.map((change) => change.level.id));
    const staying = building.levels.filter((level) => !changing.has(level.id));
    const clashes = levelNameClashes(
      staying.map((level) => level.name),
      changes.map((change) => change.name),
    );
    if (clashes.length) throw conflict(`${building.name} already has ${clashes.map((name) => `"${name}"`).join(", ")}. Rename that level first.`);
    const shorts = staying.map((level) => level.shortName);
    for (const change of changes) {
      const shortName = uniqueShortName(levelShortName(change.name), shorts);
      shorts.push(shortName);
      await tx.level.update({ where: { id: change.level.id }, data: { name: change.name, shortName } });
    }
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "Building",
      entityId: buildingId,
      action: "basements_to_parking",
      diff: { levels: changes.map((change) => ({ from: change.level.name, to: change.name })) },
    });
    return { id: buildingId, changed: changes.length };
  });
}

/** Swaps a level with the one above or below it. */
export async function moveLevel(ctx: RequestContext, levelId: string, direction: "up" | "down") {
  return db.$transaction(async (tx) => {
    const { companyId, level, building } = await ownedLevel(tx, ctx, levelId);
    const position = building.levels.findIndex((level) => level.id === levelId);
    const other = building.levels[direction === "up" ? position - 1 : position + 1];
    if (!other) return { id: levelId };
    await tx.level.update({ where: { id: level.id }, data: { order: other.order } });
    await tx.level.update({ where: { id: other.id }, data: { order: level.order } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Level", entityId: levelId, action: "moved", diff: { direction } });
    return { id: levelId };
  });
}

// ---------------------------------------------------------------------
// Where you were
// ---------------------------------------------------------------------

/** Remembers where someone is on a site, so switching back returns them there. */
export async function recordLocation(
  ctx: RequestContext,
  location: { siteId: string; buildingId?: string | null; levelId?: string | null; projectId?: string | null },
) {
  const companyId = requireCompany(ctx);
  const data = {
    companyId,
    buildingId: location.buildingId ?? null,
    levelId: location.levelId ?? null,
    projectId: location.projectId ?? null,
  };
  await db.userSiteLocation.upsert({
    where: { userId_siteId: { userId: ctx.userId, siteId: location.siteId } },
    create: { userId: ctx.userId, siteId: location.siteId, ...data },
    update: data,
  });
}

/** Where you were on a site last time, if anywhere. */
export async function locationOnSite(ctx: RequestContext, siteId: string) {
  return db.userSiteLocation.findUnique({ where: { userId_siteId: { userId: ctx.userId, siteId } } });
}

/** The most recent place you were, for Home's "On site now". */
export async function lastLocation(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  return db.userSiteLocation.findFirst({
    where: { userId: ctx.userId, companyId, site: { deletedAt: null } },
    orderBy: { updatedAt: "desc" },
    include: { site: { select: { id: true, name: true, address: true } } },
  });
}

export async function siteRouteCode(ctx: RequestContext, siteId: string) {
  const companyId = requireCompany(ctx);
  await visibleSite(db, companyId, siteId);
  return ensureRouteCode(db, { blockId: MOD, entityType: "Site", entityId: siteId, companyId, createdById: ctx.userId });
}
