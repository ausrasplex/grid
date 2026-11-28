// Public service API of the projects block (core): jobs.
//
// A company can see a job when it has a ProjectCompany row on it that is
// ACTIVE or COMPLETED. In 2a that's always the host; 2b adds invited
// companies down the contract chain.

import { app, badRequest, conflict, forbidden, notFound, requireCompany, type JobSecondStatus, type LevelUsage, type RequestContext } from "@grid/core";
import { audit, db, ensureRouteCode, type Prisma, type Tx } from "@grid/db";
import {
  addressKey,
  levelLabel,
  findOrCreatePrivateSite,
  getSite,
  lastLocation,
  listSites,
  locationOnSite,
  recordLocation,
  syncCompanySite,
  type SiteStructure,
} from "@grid/block-sites";
import { requireClient, requireLeadSource, type ClientRenamedEvent } from "@grid/block-clients";
import type { LevelDeletedEvent } from "@grid/block-sites";
import type { CoverInput, CreateProjectInput, UpdateProjectInput } from "./validation";

const MOD = "projects";
const JOB_LABEL = "Job no.";
const VISIBLE: Prisma.ProjectCompanyWhereInput["status"] = { in: ["ACTIVE", "COMPLETED"] };

async function emit(event: string, payload: unknown, ctx: { companyId: string | null; userId: string | null }) {
  await app().events.emit(event, payload, { emittedBy: MOD, companyId: ctx.companyId, actorId: ctx.userId });
}

/** The job if this company is on it, else 404. */
async function accessibleProject(tx: Tx, companyId: string, projectId: string) {
  const project = await tx.project.findFirst({
    where: { id: projectId, deletedAt: null, companies: { some: { companyId, status: VISIBLE } } },
    include: {
      covers: true,
      references: { where: { companyId }, orderBy: { createdAt: "asc" } },
      companies: { where: { companyId } },
    },
  });
  if (!project) throw notFound("Job not found");
  return project;
}

function assertHost(companyId: string, project: { hostCompanyId: string }) {
  if (project.hostCompanyId !== companyId) throw forbidden("Only the company running this job can change it");
}

/** Checks every cover points at a building/level on this site, and tidies it. */
function cleanCovers(site: SiteStructure, covers: CoverInput[]): CoverInput[] {
  const out = new Map<string, CoverInput>();
  for (const cover of covers) {
    const building = site.buildings.find((building) => building.id === cover.buildingId);
    if (!building) throw badRequest("That building isn't on this site");
    if (cover.levelId) {
      if (building.kind === "SINGLE") throw badRequest(`${building.name} has no levels`);
      if (!building.levels.some((level) => level.id === cover.levelId)) throw badRequest(`That level isn't in ${building.name}`);
    }
    out.set(`${cover.buildingId}:${cover.levelId ?? ""}`, { buildingId: cover.buildingId, levelId: cover.levelId ?? null });
  }
  // "Whole building" already includes its levels.
  const whole = new Set([...out.values()].filter((value) => !value.levelId).map((value) => value.buildingId));
  return [...out.values()].filter((value) => !value.levelId || !whole.has(value.buildingId));
}

/** A client was renamed: update the copy of the name on their jobs, and the Sites list's search words. */
export async function clientRenamed(event: ClientRenamedEvent) {
  await db.$transaction(async (tx) => {
    const jobs = await tx.project.findMany({ where: { clientId: event.clientId, hostCompanyId: event.companyId }, select: { siteId: true } });
    if (!jobs.length) return;
    await tx.project.updateMany({ where: { clientId: event.clientId, hostCompanyId: event.companyId }, data: { clientName: event.name } });
    for (const siteId of new Set(jobs.map((job) => job.siteId))) await syncSite(tx, siteId, event.companyId, null);
  });
}

/** Keeps the site's per-company counts (and archiving) in step with its jobs. */
export async function syncSite(tx: Tx, siteId: string, companyId: string, actorId: string | null) {
  const projects = await tx.project.findMany({
    // Quoting and Not won jobs don't count: a site with only those stays archived.
    where: { siteId, deletedAt: null, status: { in: ["ACTIVE", "COMPLETED"] }, companies: { some: { companyId, status: VISIBLE } } },
    select: { status: true, name: true, clientName: true },
  });
  const keywords = [...new Set(projects.flatMap((project) => [project.clientName ?? "", project.name]).filter(Boolean))].join(" ").slice(0, 2000);
  await syncCompanySite(tx, {
    siteId,
    companyId,
    activeJobs: projects.filter((project) => project.status === "ACTIVE").length,
    totalJobs: projects.length,
    keywords,
    actorId,
  });
}

/** Next job number for a company: J-1001, J-1002… (numbers someone typed themselves are skipped over). */
async function nextJobNumber(tx: Tx, companyId: string): Promise<string> {
  const refs = await tx.projectReference.findMany({ where: { companyId, label: JOB_LABEL }, select: { value: true } });
  const max = refs.reduce((total, ref) => {
    const numberPart = Number(ref.value.match(/(\d+)\s*$/)?.[1]);
    return Number.isFinite(numberPart) && numberPart > total ? numberPart : total;
  }, 1000);
  return `J-${max + 1}`;
}

async function assertJobNumberFree(tx: Tx, companyId: string, value: string, exceptProjectId?: string) {
  const clash = await tx.projectReference.findFirst({
    where: {
      companyId,
      label: JOB_LABEL,
      value: { equals: value, mode: "insensitive" },
      project: { deletedAt: null },
      ...(exceptProjectId ? { projectId: { not: exceptProjectId } } : {}),
    },
  });
  if (clash) throw conflict(`Job number ${value} is already used`);
}

// ---------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------

/**
 * Starts a job: at an existing site (with Covers), or at an address, which
 * finds or creates the company's private site there (reactivating it if it
 * was archived). The host's ProjectCompany row means the contract chain
 * exists from day one.
 */
export async function createProject(ctx: RequestContext, input: CreateProjectInput, options: { quoting?: boolean } = {}) {
  const companyId = requireCompany(ctx);
  const quoting = !!options.quoting;
  const result = await db.$transaction(async (tx) => {
    let siteId: string;
    let covers: CoverInput[];
    let reactivated = false;

    if (input.siteId) {
      const site = await getSite(ctx, input.siteId, tx);
      siteId = site.id;
      covers = cleanCovers(site, input.covers ?? []);
      if (covers.length === 0) {
        if (site.buildings.length === 1) covers = [{ buildingId: site.buildings[0]!.id, levelId: null }];
        else throw badRequest("Pick the buildings or levels this job works on");
      }
    } else if (input.address) {
      const found = await findOrCreatePrivateSite(tx, { companyId, userId: ctx.userId, address: input.address });
      siteId = found.siteId;
      reactivated = found.wasArchived;
      const site = await getSite(ctx, siteId, tx);
      covers = cleanCovers(site, input.covers ?? []);
      if (covers.length === 0) covers = [{ buildingId: found.buildingId, levelId: null }];
    } else {
      throw badRequest("Give the job an address or pick a site");
    }

    const site = await tx.site.findUniqueOrThrow({ where: { id: siteId }, select: { kind: true } });
    const client = input.clientId ? await requireClient(tx, companyId, input.clientId) : null;
    // A Quoting job gets its job number when it's won.
    const jobNumber = quoting ? null : input.jobNumber?.trim() || (await nextJobNumber(tx, companyId));
    if (jobNumber) await assertJobNumberFree(tx, companyId, jobNumber);

    const project = await tx.project.create({
      data: {
        siteId,
        hostCompanyId: companyId,
        name: input.name,
        clientId: client?.id ?? null,
        clientName: client?.label ?? null,
        description: input.description || null,
        status: quoting ? "QUOTING" : "ACTIVE",
        listing: site.kind === "MANAGED" ? "LISTED" : "UNLISTED",
        createdById: ctx.userId,
        covers: { create: covers.map((cover) => ({ buildingId: cover.buildingId, levelId: cover.levelId ?? null })) },
        companies: { create: { companyId, status: "ACTIVE" } },
        references: {
          create: [...(jobNumber ? [{ companyId, label: JOB_LABEL, value: jobNumber }] : []), ...(input.references ?? []).map((reference) => ({ companyId, ...reference }))],
        },
      },
    });
    await syncSite(tx, siteId, companyId, ctx.userId);
    await ensureRouteCode(tx, { blockId: MOD, entityType: "Project", entityId: project.id, companyId, createdById: ctx.userId });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      projectId: project.id,
      entityType: "Project",
      entityId: project.id,
      action: "created",
      diff: { name: input.name, siteId, jobNumber, covers, reactivatedSite: reactivated, quoting: quoting || undefined } as Prisma.InputJsonValue,
    });
    return { id: project.id, siteId, jobNumber, reactivatedSite: reactivated };
  });
  if (!quoting) await emit("projects.created", { projectId: result.id, siteId: result.siteId }, ctx);
  return result;
}

/** A quote's job before it's won, to hold plans for the take-off (docs/stage-2-projects.md "Quoting jobs"). Only the Quotes Block makes these. */
export async function createQuotingJob(ctx: RequestContext, input: CreateProjectInput) {
  return createProject(ctx, input, { quoting: true });
}

/**
 * A quote's answer moves its Quoting job along (events from the Quotes
 * Block, so Jobs doesn't depend on it): accepted → an ordinary active job
 * with a job number; declined or withdrawn → Not won (kept with its plans);
 * revised again → back to Quoting. Jobs that aren't Quoting or Not won
 * (a quote for extra work on a real job) are left alone.
 */
export async function quotingOutcome(event: { projectId: string | null }, meta: { companyId: string | null; actorId: string | null }, outcome: "WON" | "NOT_WON" | "QUOTING") {
  if (!event.projectId || !meta.companyId) return;
  const companyId = meta.companyId;
  const result = await db.$transaction(async (tx) => {
    const project = await tx.project.findFirst({ where: { id: event.projectId!, hostCompanyId: companyId, deletedAt: null } });
    if (!project || (project.status !== "QUOTING" && project.status !== "NOT_WON")) return null;
    const to = outcome === "WON" ? "ACTIVE" : outcome;
    if (project.status === to) return null;
    let jobNumber: string | null = null;
    if (to === "ACTIVE") {
      const has = await tx.projectReference.findFirst({ where: { projectId: project.id, companyId, label: JOB_LABEL } });
      if (!has) {
        jobNumber = await nextJobNumber(tx, companyId);
        await tx.projectReference.create({ data: { projectId: project.id, companyId, label: JOB_LABEL, value: jobNumber } });
      }
    }
    await tx.project.update({ where: { id: project.id }, data: { status: to, ...(to === "ACTIVE" ? { startedAt: new Date() } : {}) } });
    await syncSite(tx, project.siteId, companyId, meta.actorId);
    await audit(tx, {
      blockId: MOD,
      actorId: meta.actorId,
      companyId,
      projectId: project.id,
      entityType: "Project",
      entityId: project.id,
      action: to === "ACTIVE" ? "won" : to === "NOT_WON" ? "not_won" : "quoting_again",
      diff: { from: project.status, to, jobNumber: jobNumber ?? undefined },
    });
    return { siteId: project.siteId, won: to === "ACTIVE" };
  });
  if (result?.won) await emit("projects.created", { projectId: event.projectId, siteId: result.siteId }, { companyId, userId: meta.actorId });
}

// ---------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------

/** Can this company see the job? (Other blocks use it to guard their own records.) */
export async function canSeeJob(ctx: RequestContext, projectId: string): Promise<boolean> {
  if (!ctx.companyId) return false;
  const visibleCount = await db.projectCompany.count({ where: { projectId, companyId: ctx.companyId, status: VISIBLE, project: { deletedAt: null } } });
  return visibleCount > 0;
}

/**
 * Job names and numbers for labels in system logs (the clean-up history).
 * No access check: only for server jobs that already decided what to log.
 */
export async function jobLabelsForSystem(projectIds: string[]): Promise<Map<string, string>> {
  const rows = await db.project.findMany({
    where: { id: { in: [...new Set(projectIds)] } },
    select: { id: true, name: true, hostCompanyId: true, references: { where: { label: JOB_LABEL }, select: { value: true, companyId: true } } },
  });
  return new Map(
    rows.map((row) => {
      const hostJobNumber = row.references.find((reference) => reference.companyId === row.hostCompanyId)?.value;
      return [row.id, hostJobNumber ? `${row.name} (${hostJobNumber})` : row.name];
    }),
  );
}

export interface Area {
  buildingId: string;
  buildingName: string;
  levelId: string | null;
  levelName: string | null;
  shortName: string | null;
}

/** Every place a job works, in site order: whole multi-level buildings expand to their levels. */
export function areasOf(site: SiteStructure, covers: { buildingId: string; levelId: string | null }[]): Area[] {
  const out: Area[] = [];
  for (const building of site.buildings) {
    const mine = covers.filter((cover) => cover.buildingId === building.id);
    if (!mine.length) continue;
    if (building.kind === "SINGLE") {
      out.push({ buildingId: building.id, buildingName: building.name, levelId: null, levelName: null, shortName: null });
      continue;
    }
    const whole = mine.some((cover) => !cover.levelId);
    for (const level of building.levels) {
      if (whole || mine.some((cover) => cover.levelId === level.id)) {
        out.push({ buildingId: building.id, buildingName: building.name, levelId: level.id, levelName: level.label, shortName: level.shortName });
      }
    }
    if (whole && building.levels.length === 0) {
      out.push({ buildingId: building.id, buildingName: building.name, levelId: null, levelName: null, shortName: null });
    }
  }
  return out;
}

export interface JobSummary {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  /** QUOTING and NOT_WON are a quote's job before (or instead of) being won. */
  status: "ACTIVE" | "COMPLETED" | "QUOTING" | "NOT_WON";
  jobNumber: string | null;
  startedAt: Date;
  completedAt: Date | null;
  /** Finished and archived (phase 2e): viewing copies dropped, drawn again when opened. */
  archivedAt: Date | null;
  siteId: string;
  siteName: string;
  /** "Scheduled", "To be booked": shown after Active, from another block (withSecondStatus). */
  secondStatus?: JobSecondStatus | null;
}

/**
 * Second statuses for jobs ("Active • Scheduled"), from whichever blocks
 * offer one (the jobSecondStatus hook: scheduling). Only active, not
 * archived jobs get one. One call per block for the whole list.
 */
export async function secondStatuses(ctx: RequestContext, jobs: { id: string; status: string; archivedAt?: Date | string | null; archived?: boolean }[]): Promise<Record<string, JobSecondStatus>> {
  const ids = jobs.filter((job) => job.status === "ACTIVE" && !job.archivedAt && !job.archived).map((job) => job.id);
  const result: Record<string, JobSecondStatus> = {};
  if (!ids.length || !ctx.companyId) return result;
  for (const block of app().registry.blocks) {
    if (!block.jobSecondStatus || !(block.required || ctx.enabledBlocks.has(block.id))) continue;
    try {
      Object.assign(result, await (await block.jobSecondStatus())(ctx, ids));
    } catch (error) {
      console.error(`[projects] ${block.id} couldn't give second statuses`, error);
    }
  }
  return result;
}

/** The same jobs, each with its second status (or null). */
export async function withSecondStatus<T extends { id: string; status: string; archivedAt?: Date | string | null }>(ctx: RequestContext, jobs: T[]): Promise<(T & { secondStatus: JobSecondStatus | null })[]> {
  const statuses = await secondStatuses(ctx, jobs);
  return jobs.map((job) => ({ ...job, secondStatus: statuses[job.id] ?? null }));
}

const summarySelect = (companyId: string) =>
  ({
    id: true,
    name: true,
    clientId: true,
    clientName: true,
    status: true,
    startedAt: true,
    completedAt: true,
    archivedAt: true,
    siteId: true,
    references: { where: { companyId, label: JOB_LABEL }, select: { value: true }, take: 1 },
    covers: { select: { buildingId: true, levelId: true } },
  }) satisfies Prisma.ProjectSelect;

type SummaryRow = Prisma.ProjectGetPayload<{ select: ReturnType<typeof summarySelect> }>;

function toSummary(row: SummaryRow, siteName: string): JobSummary {
  return {
    id: row.id,
    name: row.name,
    clientId: row.clientId,
    clientName: row.clientName,
    status: row.status,
    jobNumber: row.references[0]?.value ?? null,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    archivedAt: row.archivedAt,
    siteId: row.siteId,
    siteName,
  };
}

export interface JobView extends JobSummary {
  /** How this job came in, when it's not the client's own (a LeadSource id), or null. */
  leadSourceId: string | null;
  /** The quote it came from ("Q-1042"), when it did. */
  quoteNumber: string | null;
  description: string | null;
  listing: "LISTED" | "UNLISTED";
  isHost: boolean;
  covers: { buildingId: string; levelId: string | null }[];
  areas: Area[];
  site: SiteStructure;
  /** Where you last were on this job. */
  lastArea: { buildingId: string; levelId: string | null } | null;
}

export async function getProject(ctx: RequestContext, projectId: string): Promise<JobView> {
  const companyId = requireCompany(ctx);
  const project = await accessibleProject(db, companyId, projectId);
  const site = await getSite(ctx, project.siteId);
  const last = await db.userProjectLevel.findUnique({ where: { userId_projectId: { userId: ctx.userId, projectId } } });
  const covers = project.covers.map((cover) => ({ buildingId: cover.buildingId, levelId: cover.levelId }));
  return {
    id: project.id,
    name: project.name,
    clientId: project.clientId,
    clientName: project.clientName,
    leadSourceId: project.leadSourceId,
    description: project.description,
    status: project.status,
    listing: project.listing,
    startedAt: project.startedAt,
    completedAt: project.completedAt,
    archivedAt: project.archivedAt,
    siteId: project.siteId,
    siteName: site.name,
    jobNumber: project.references.find((reference) => reference.label === JOB_LABEL)?.value ?? null,
    quoteNumber: project.references.find((reference) => reference.label === "Quote")?.value ?? null,
    isHost: project.hostCompanyId === companyId,
    covers,
    areas: areasOf(site, covers),
    site,
    lastArea: last ? { buildingId: last.buildingId, levelId: last.levelId } : null,
  };
}

/** Does a job's Covers include this building / level? */
export function covers(projectCovers: { buildingId: string; levelId: string | null }[], buildingId?: string | null, levelId?: string | null) {
  if (!buildingId) return true;
  return projectCovers.some((projectCover) => projectCover.buildingId === buildingId && (!levelId || !projectCover.levelId || projectCover.levelId === levelId));
}

/**
 * This company's jobs at a site, optionally only those covering a building
 * or level. Active first (newest first), then finished (most recent first).
 */
export async function jobsAt(ctx: RequestContext, location: { siteId: string; buildingId?: string | null; levelId?: string | null }) {
  const companyId = requireCompany(ctx);
  const site = await getSite(ctx, location.siteId);
  const rows = await db.project.findMany({
    where: { siteId: location.siteId, deletedAt: null, companies: { some: { companyId, status: VISIBLE } } },
    select: summarySelect(companyId),
    orderBy: { startedAt: "desc" },
  });
  const here = rows.filter((row) => covers(row.covers, location.buildingId, location.levelId));
  const active = here.filter((project) => project.status === "ACTIVE").map((project) => toSummary(project, site.name));
  const earlier = here
    .filter((project) => project.status === "COMPLETED")
    .sort((first, second) => (second.completedAt?.getTime() ?? 0) - (first.completedAt?.getTime() ?? 0))
    .map((project) => toSummary(project, site.name));

  // Active job counts per building and level, for the pickers.
  const counts: Record<string, number> = {};
  for (const project of rows.filter((row) => row.status === "ACTIVE")) {
    for (const building of site.buildings) {
      if (!project.covers.some((cover) => cover.buildingId === building.id)) continue;
      counts[building.id] = (counts[building.id] ?? 0) + 1;
      for (const level of building.levels) if (covers(project.covers, building.id, level.id)) counts[level.id] = (counts[level.id] ?? 0) + 1;
    }
  }
  return { site, active, earlier, counts };
}

/**
 * A client's jobs for their page: active ones (newest first) and the last few
 * finished. Several ids: everyone at a business, on the business's page.
 */
export async function jobsForClient(ctx: RequestContext, clientIds: string[], earlierLimit = 5) {
  const companyId = requireCompany(ctx);
  if (!clientIds.length) return { active: [], earlier: [], earlierCount: 0 };
  const rows = await db.project.findMany({
    where: { clientId: { in: clientIds }, deletedAt: null, companies: { some: { companyId, status: VISIBLE } } },
    select: summarySelect(companyId),
    orderBy: { startedAt: "desc" },
    take: 300,
  });
  const sites = await db.site.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.siteId))] } }, select: { id: true, name: true } });
  const siteName = new Map(sites.map((site) => [site.id, site.name]));
  const finished = rows
    .filter((row) => row.status === "COMPLETED")
    .sort((first, second) => (second.completedAt?.getTime() ?? 0) - (first.completedAt?.getTime() ?? 0));
  return {
    active: rows.filter((row) => row.status === "ACTIVE").map((row) => toSummary(row, siteName.get(row.siteId) ?? "")),
    earlier: finished.slice(0, earlierLimit).map((row) => toSummary(row, siteName.get(row.siteId) ?? "")),
    earlierCount: finished.length,
  };
}

/** Active jobs and the sites they're on, for Home's summary. */
export async function activeJobCounts(ctx: RequestContext): Promise<{ jobs: number; sites: number }> {
  const companyId = requireCompany(ctx);
  const rows = await db.project.findMany({
    where: { deletedAt: null, status: "ACTIVE", companies: { some: { companyId, status: "ACTIVE" } } },
    select: { siteId: true },
  });
  return { jobs: rows.length, sites: new Set(rows.map((row) => row.siteId)).size };
}

/** Your active jobs, the ones you used most recently first. */
export async function myActiveJobs(ctx: RequestContext, limit = 8): Promise<JobSummary[]> {
  const companyId = requireCompany(ctx);
  const rows = await db.project.findMany({
    where: { deletedAt: null, status: "ACTIVE", companies: { some: { companyId, status: "ACTIVE" } } },
    select: { ...summarySelect(companyId), siteId: true },
    orderBy: { startedAt: "desc" },
    take: 100,
  });
  const used = await db.userProjectLevel.findMany({
    where: { userId: ctx.userId, projectId: { in: rows.map((row) => row.id) } },
    select: { projectId: true, updatedAt: true },
  });
  const usedAt = new Map(used.map((use) => [use.projectId, use.updatedAt.getTime()]));
  const sites = await db.site.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.siteId))] } }, select: { id: true, name: true } });
  const siteName = new Map(sites.map((site) => [site.id, site.name]));
  return rows
    .sort((first, second) => (usedAt.get(second.id) ?? 0) - (usedAt.get(first.id) ?? 0) || second.startedAt.getTime() - first.startedAt.getTime())
    .slice(0, limit)
    .map((row) => toSummary(row, siteName.get(row.siteId) ?? ""));
}

/** Home's "On site now": where you last were, if it's still an active job or site. */
export async function onSiteNow(ctx: RequestContext) {
  const location = await lastLocation(ctx);
  if (!location) return null;
  let job: { id: string; name: string } | null = null;
  if (location.projectId) {
    const project = await db.project.findFirst({
      where: { id: location.projectId, status: "ACTIVE", deletedAt: null, companies: { some: { companyId: ctx.companyId!, status: "ACTIVE" } } },
      select: { id: true, name: true },
    });
    job = project;
  }
  let levelName: string | null = null;
  if (location.levelId) {
    const level = await db.level.findUnique({ where: { id: location.levelId }, select: { name: true, use: true } });
    levelName = level ? levelLabel(level) : null;
  }
  return { site: location.site, job, levelName, updatedAt: location.updatedAt, href: resumeHref(location) };
}

function resumeHref(location: { siteId: string; buildingId: string | null; levelId: string | null; projectId: string | null }) {
  if (location.projectId) {
    return location.buildingId
      ? `/jobs/${location.projectId}/area/${location.buildingId}${location.levelId ? `/${location.levelId}` : ""}`
      : `/jobs/${location.projectId}`;
  }
  if (location.buildingId) return `/sites/${location.siteId}/${location.buildingId}${location.levelId ? `/${location.levelId}` : ""}`;
  return `/sites/${location.siteId}`;
}

/** Switching site returns you to where you last were on it (docs/navigation.md §2). */
export async function resumeOnSite(ctx: RequestContext, siteId: string): Promise<string> {
  const location = await locationOnSite(ctx, siteId);
  if (!location) return `/sites/${siteId}`;
  if (location.projectId) {
    const ok = await db.project.findFirst({
      where: { id: location.projectId, deletedAt: null, companies: { some: { companyId: ctx.companyId!, status: VISIBLE } } },
      select: { id: true },
    });
    if (!ok) return `/sites/${siteId}`;
  }
  return resumeHref(location);
}

/** Remembers the area you're looking at, on the job and on the site. */
export async function recordArea(ctx: RequestContext, projectId: string, area: { buildingId: string; levelId: string | null } | null, siteId: string) {
  if (area) {
    await db.userProjectLevel.upsert({
      where: { userId_projectId: { userId: ctx.userId, projectId } },
      create: { userId: ctx.userId, projectId, buildingId: area.buildingId, levelId: area.levelId },
      update: { buildingId: area.buildingId, levelId: area.levelId },
    });
  }
  await recordLocation(ctx, { siteId, buildingId: area?.buildingId, levelId: area?.levelId, projectId });
}

export { recordLocation };

// ---------------------------------------------------------------------
// Changing
// ---------------------------------------------------------------------

export async function updateProject(ctx: RequestContext, projectId: string, input: UpdateProjectInput) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const project = await accessibleProject(tx, companyId, projectId);
    assertHost(companyId, project);
    // A different client (or none). Keeping the same one is fine even if it's since been removed from the list.
    const client =
      input.clientId === undefined || input.clientId === project.clientId ? undefined : input.clientId ? await requireClient(tx, companyId, input.clientId) : null;
    // How this job came in, when it's not the client's own. Keeping one that's since been hidden is fine.
    if (input.leadSourceId) await requireLeadSource(tx, companyId, input.leadSourceId, project.leadSourceId);
    if (input.jobNumber !== undefined) {
      const value = input.jobNumber.trim();
      await assertJobNumberFree(tx, companyId, value, projectId);
      const ref = project.references.find((reference) => reference.label === JOB_LABEL);
      if (ref) await tx.projectReference.update({ where: { id: ref.id }, data: { value } });
      else await tx.projectReference.create({ data: { projectId, companyId, label: JOB_LABEL, value } });
    }
    let coversChanged = false;
    if (input.covers) {
      const site = await getSite(ctx, project.siteId, tx);
      const next = cleanCovers(site, input.covers);
      if (next.length === 0) throw badRequest("A job needs at least one building or level");
      // Shrinking never deletes work: items on a removed level stay on the job (later Blocks show them under "Outside current areas").
      await tx.projectCover.deleteMany({ where: { projectId } });
      await tx.projectCover.createMany({ data: next.map((cover) => ({ projectId, buildingId: cover.buildingId, levelId: cover.levelId ?? null })) });
      coversChanged = true;
    }
    await tx.project.update({
      where: { id: projectId },
      data: {
        name: input.name,
        ...(client === undefined ? {} : { clientId: client?.id ?? null, clientName: client?.label ?? null }),
        description: input.description === undefined ? undefined : input.description || null,
        leadSourceId: input.leadSourceId,
        listing: input.listing,
      },
    });
    if (input.name !== undefined || client !== undefined) await syncSite(tx, project.siteId, companyId, ctx.userId);
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      projectId,
      entityType: "Project",
      entityId: projectId,
      action: coversChanged ? "updated_with_covers" : "updated",
      diff: input as Prisma.InputJsonValue,
    });
    return { id: projectId };
  });
}

/** Finish or reopen a job. Finishing the last active job at a site archives the site (for you). */
export async function setProjectStatus(ctx: RequestContext, projectId: string, status: "ACTIVE" | "COMPLETED") {
  const companyId = requireCompany(ctx);
  const result = await db.$transaction(async (tx) => {
    const project = await accessibleProject(tx, companyId, projectId);
    assertHost(companyId, project);
    if (project.status === "QUOTING" || project.status === "NOT_WON") throw conflict("This is a quote's job: it becomes a job when the quote is accepted");
    if (project.status === status) return { id: projectId, status, siteId: project.siteId, restored: false };
    // Reopening an archived job restores it first (its copies are drawn again).
    const restored = status === "ACTIVE" && !!project.archivedAt;
    await tx.project.update({
      where: { id: projectId },
      data: { status, completedAt: status === "COMPLETED" ? new Date() : null, ...(restored ? { archivedAt: null, archivedById: null } : {}) },
    });
    if (restored) await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId, entityType: "Project", entityId: projectId, action: "restored" });
    await tx.projectCompany.updateMany({ where: { projectId, companyId }, data: { status } });
    await syncSite(tx, project.siteId, companyId, ctx.userId);
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      projectId,
      entityType: "Project",
      entityId: projectId,
      action: status === "COMPLETED" ? "completed" : "reopened",
    });
    return { id: projectId, status, siteId: project.siteId, restored };
  });
  if (result.restored) await emit("projects.restored", { projectId, siteId: result.siteId, companyId }, ctx);
  await emit(status === "COMPLETED" ? "projects.completed" : "projects.reopened", { projectId, siteId: result.siteId }, ctx);
  return result;
}

/**
 * Archive a finished job (phase 2e, docs/stage-2-projects.md "Job storage"):
 * every Block drops its big viewing copies ("projects.archived"), keeping
 * originals, markups and thumbnails. Opening it draws them again for a day.
 */
export async function archiveProject(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  const result = await db.$transaction(async (tx) => {
    const project = await accessibleProject(tx, companyId, projectId);
    assertHost(companyId, project);
    if (project.status !== "COMPLETED") throw conflict("Finish the job before archiving it");
    if (project.archivedAt) return { id: projectId, archivedAt: project.archivedAt, siteId: project.siteId, changed: false };
    const archivedAt = new Date();
    await tx.project.update({ where: { id: projectId }, data: { archivedAt, archivedById: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId, entityType: "Project", entityId: projectId, action: "archived" });
    return { id: projectId, archivedAt, siteId: project.siteId, changed: true };
  });
  if (result.changed) await emit("projects.archived", { projectId, siteId: result.siteId, companyId }, ctx);
  return { id: result.id, archivedAt: result.archivedAt };
}

/** Back to an ordinary finished job: every Block draws its copies again and keeps them ("projects.restored"). */
export async function restoreProject(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  const result = await db.$transaction(async (tx) => {
    const project = await accessibleProject(tx, companyId, projectId);
    assertHost(companyId, project);
    if (!project.archivedAt) return { siteId: project.siteId, changed: false };
    await tx.project.update({ where: { id: projectId }, data: { archivedAt: null, archivedById: null } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId, entityType: "Project", entityId: projectId, action: "restored" });
    return { siteId: project.siteId, changed: true };
  });
  if (result.changed) await emit("projects.restored", { projectId, siteId: result.siteId, companyId }, ctx);
  return { id: projectId, archivedAt: null };
}

/** Is the job archived? For Blocks deciding whether a copy is temporary. No access check. */
export async function isJobArchived(projectId: string): Promise<boolean> {
  return (await db.project.count({ where: { id: projectId, archivedAt: { not: null } } })) > 0;
}

/** Every archived job (any business), for the nightly clean-up of temporary copies. No access check. */
export async function archivedJobIds(): Promise<string[]> {
  return (await db.project.findMany({ where: { archivedAt: { not: null }, deletedAt: null }, select: { id: true } })).map((project) => project.id);
}

export async function projectRouteCode(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  await accessibleProject(db, companyId, projectId);
  return ensureRouteCode(db, { blockId: MOD, entityType: "Project", entityId: projectId, companyId, createdById: ctx.userId });
}

/** Is there already a site of yours at this address? (New job screen: "2 earlier jobs here".) */
export async function checkAddress(ctx: RequestContext, address: string) {
  const companyId = requireCompany(ctx);
  const site = await db.site.findFirst({
    where: { ownerCompanyId: companyId, addressKey: addressKey(address), deletedAt: null },
    include: { states: { where: { companyId } } },
  });
  if (!site) return null;
  const state = site.states[0];
  return {
    siteId: site.id,
    name: site.name,
    archived: !!state?.archivedAt,
    activeJobs: state?.activeJobs ?? 0,
    totalJobs: state?.totalJobs ?? 0,
  };
}

// ---------------------------------------------------------------------
// Jump to search (docs/navigation.md §6)
// ---------------------------------------------------------------------

export interface SearchResult {
  type: "job" | "site";
  id: string;
  title: string;
  /** Job number, client, address… */
  meta: string;
  /** Breadcrumb-ish trail so similar names can be told apart. */
  trail: string;
  href: string;
  status?: JobSummary["status"];
}

const STATUS_WORD: Record<JobSummary["status"], string | null> = { ACTIVE: null, COMPLETED: "Finished", QUOTING: "Quoting", NOT_WON: "Not won" };

function jobHref(id: string) {
  return `/jobs/${id}`;
}

const squash = (text: string) => text.toLowerCase().replace(/[^0-9a-z]/g, "");

/**
 * One search that understands numbers. An exact job-number match is always
 * first (and Enter jumps straight to it). Nothing typed shows recent jobs.
 * Results only include what you could open anyway.
 */
export async function search(ctx: RequestContext, typed: string): Promise<{ exact: SearchResult | null; jobs: SearchResult[]; sites: SearchResult[] }> {
  const companyId = requireCompany(ctx);
  const query = typed.trim().slice(0, 100);

  if (!query) {
    const recent = await myActiveJobs(ctx, 8);
    return {
      exact: null,
      jobs: recent.map((job) => ({
        type: "job",
        id: job.id,
        title: job.name,
        meta: [job.jobNumber, job.clientName].filter(Boolean).join(" · "),
        trail: job.siteName,
        href: jobHref(job.id),
        status: job.status,
      })),
      sites: [],
    };
  }

  const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const rows = await db.project.findMany({
    where: {
      deletedAt: null,
      companies: { some: { companyId, status: VISIBLE } },
      OR: [
        { references: { some: { companyId, value: { contains: query, mode: "insensitive" } } } },
        {
          AND: words.map((word) => ({
            OR: [
              { name: { contains: word, mode: "insensitive" as const } },
              { clientName: { contains: word, mode: "insensitive" as const } },
            ],
          })),
        },
      ],
    },
    select: { ...summarySelect(companyId), siteId: true },
    orderBy: [{ status: "asc" }, { startedAt: "desc" }],
    take: 30,
  });
  const sites = await db.site.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.siteId))] } }, select: { id: true, name: true } });
  const siteName = new Map(sites.map((site) => [site.id, site.name]));

  const jobs: SearchResult[] = rows.map((row) => {
    const summary = toSummary(row, siteName.get(row.siteId) ?? "");
    return {
      type: "job",
      id: summary.id,
      title: summary.name,
      meta: [summary.jobNumber, summary.clientName, STATUS_WORD[summary.status]].filter(Boolean).join(" · "),
      trail: summary.siteName,
      href: jobHref(summary.id),
      status: summary.status,
    };
  });

  // "1042", "j1042" and "J-1042" all find J-1042 exactly.
  const want = squash(query);
  const exactRow = rows.find((row) => row.references.some((ref) => squash(ref.value) === want || squash(ref.value).replace(/^[a-z]+/, "") === want));
  const exact = exactRow ? (jobs.find((job) => job.id === exactRow.id) ?? null) : null;

  const siteRows = await listSites(ctx, { tab: "active", q: query, limit: 6 });
  const archivedSites = siteRows.length < 6 ? await listSites(ctx, { tab: "archived", q: query, limit: 6 - siteRows.length }) : [];
  const siteResults: SearchResult[] = [...siteRows, ...archivedSites].map((siteRow) => ({
    type: "site",
    id: siteRow.id,
    title: siteRow.name,
    meta: siteRow.archivedAt ? `Archived · ${siteRow.totalJobs} earlier job${siteRow.totalJobs === 1 ? "" : "s"}` : `${siteRow.activeJobs} active job${siteRow.activeJobs === 1 ? "" : "s"}`,
    trail: siteRow.address,
    href: `/sites/${siteRow.id}`,
  }));

  return { exact, jobs: jobs.filter((job) => job.id !== exact?.id), sites: siteResults };
}

/** Jobs (any business, finished ones too) that cover a level by name, so an empty floor can be deleted. */
export async function levelUsage(levelId: string): Promise<LevelUsage[]> {
  const jobs = await db.projectCover.count({ where: { levelId, project: { deletedAt: null } } });
  return [{ count: jobs, one: "job covers it", many: "jobs cover it" }];
}

/** A floor was deleted: "last area" on a job falls back to its building. */
export async function levelDeleted(event: LevelDeletedEvent) {
  await db.userProjectLevel.updateMany({ where: { levelId: event.levelId }, data: { levelId: null } });
}

// ─── For the Scheduling Block ───────────────────────────────────────────

export interface ScheduleJob {
  id: string;
  name: string;
  jobNumber: string | null;
  status: "ACTIVE" | "COMPLETED" | "QUOTING" | "NOT_WON";
  archived: boolean;
  clientName: string | null;
  siteName: string;
  /** "Brunswick". */
  suburb: string | null;
  /** The one line: "12 Smith St, Brunswick VIC 3056". */
  address: string;
  startedAt: Date;
}

/**
 * Jobs this business can see, with what a schedule shows about them: by id,
 * or every active (won, not finished, not archived) job for "To be booked".
 */
export async function scheduleJobs(ctx: RequestContext, filter: { ids: string[] } | { active: true }): Promise<ScheduleJob[]> {
  const companyId = requireCompany(ctx);
  const rows = await db.project.findMany({
    where: {
      deletedAt: null,
      companies: { some: { companyId, status: VISIBLE } },
      ...("ids" in filter ? { id: { in: [...new Set(filter.ids)] } } : { status: "ACTIVE", archivedAt: null }),
    },
    select: summarySelect(companyId),
    orderBy: { startedAt: "asc" },
  });
  const sites = await db.site.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.siteId))] } }, select: { id: true, name: true, suburb: true, address: true } });
  const siteById = new Map(sites.map((site) => [site.id, site]));
  return rows.map((row) => {
    const site = siteById.get(row.siteId);
    return {
      id: row.id,
      name: row.name,
      jobNumber: row.references[0]?.value ?? null,
      status: row.status,
      archived: !!row.archivedAt,
      clientName: row.clientName,
      siteName: site?.name ?? "",
      suburb: site?.suburb ?? null,
      address: site?.address ?? "",
      startedAt: row.startedAt,
    };
  });
}

