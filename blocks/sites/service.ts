// Public service API of the sites block (core).
//
// A company sees a site when it owns it or has a SiteCompanyState row for
// it (the projects block adds one when the company starts a job there).
// Structure (buildings and levels) can only be changed by the owner company
// for now; site editors, proposals and claims come in 2b.

import { app, badRequest, forbidden, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, ensureRouteCode, type Prisma, type Tx } from "@grid/db";
import { addressKey, levelShortName, siteNameFromAddress } from "./address";
import type { AddBuildingInput, AddLevelsInput, CreateSiteInput, UpdateSiteInput } from "./validation";

const MOD = "sites";

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
  address: string;
  notes: string | null;
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
    levels: { id: string; name: string; shortName: string; order: number }[];
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
    notes: site.notes,
    ownerCompanyId: site.ownerCompanyId,
    ownedByMe: site.ownerCompanyId === companyId,
    archivedAt: state?.archivedAt ?? null,
    activeJobs: state?.activeJobs ?? 0,
    totalJobs: state?.totalJobs ?? 0,
    buildings: site.buildings.map((building) => ({
      id: building.id,
      name: building.name,
      kind: building.kind,
      levels: building.levels.map((level) => ({ id: level.id, name: level.name, shortName: level.shortName, order: level.order })),
    })),
  };
}

export type SitesTab = "active" | "mine" | "archived";

export interface SiteListRow {
  id: string;
  name: string;
  address: string;
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
    include: { site: { select: { id: true, name: true, address: true, kind: true, _count: { select: { buildings: true } } } } },
    orderBy: { lastActivityAt: "desc" },
    take: 300,
  });

  const rows = states.map((state) => ({
    id: state.site.id,
    name: state.site.name,
    address: state.site.address,
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
        address: input.address,
        addressKey: addressKey(input.address),
        notes: input.notes ?? null,
        createdById: ctx.userId,
      },
    });
    await tx.siteCompanyState.create({ data: { siteId: site.id, companyId } });
    await ensureRouteCode(tx, { blockId: MOD, entityType: "Site", entityId: site.id, companyId, createdById: ctx.userId });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Site", entityId: site.id, action: "created", diff: { kind: "MANAGED", name: input.name, address: input.address } });
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
  input: { companyId: string; userId: string; address: string; name?: string },
): Promise<{ siteId: string; buildingId: string; created: boolean; wasArchived: boolean }> {
  const key = addressKey(input.address);
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
      name: input.name?.trim() || siteNameFromAddress(input.address),
      address: input.address,
      addressKey: key,
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
    diff: { kind: "PRIVATE", address: input.address, auto: true },
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
    // Notes can be kept by anyone with a job there; name and address belong to the owner.
    if ((input.name !== undefined || input.address !== undefined) && site.ownerCompanyId !== companyId) {
      throw forbidden("Only the company that looks after this site can rename it");
    }
    const updated = await tx.site.update({
      where: { id: siteId },
      data: {
        name: input.name,
        address: input.address,
        addressKey: input.address !== undefined ? addressKey(input.address) : undefined,
        notes: input.notes,
      },
    });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Site", entityId: siteId, action: "updated", diff: input as Prisma.InputJsonValue });
    return { id: updated.id };
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
    // Orders for the new levels, highest first.
    const start = input.position === "below" ? (bottom ?? count) - 1 : (top ?? -1) + count;
    const created = [];
    for (let index = 0; index < count; index++) {
      const name = input.names[index]!;
      created.push(
        await tx.level.create({ data: { buildingId, name, shortName: levelShortName(name), order: start - index } }),
      );
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

export async function updateLevel(ctx: RequestContext, levelId: string, input: { name: string; shortName?: string }) {
  return db.$transaction(async (tx) => {
    const { companyId, level } = await ownedLevel(tx, ctx, levelId);
    await tx.level.update({
      where: { id: levelId },
      data: { name: input.name, shortName: input.shortName?.trim() || levelShortName(input.name) },
    });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Level", entityId: levelId, action: "renamed", diff: { from: level.name, ...input } });
    return { id: levelId };
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
