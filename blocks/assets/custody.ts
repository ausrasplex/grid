// Who has an asset and where it is (docs/assets-block.md §2, §2a): Check
// out (to you, or to someone else with assets.assign, optionally on a job
// and level), Return (to the workshop, a van or a job), Take over (moves
// it to you from whoever had it). One AssetCustody row per move; the
// current one has no toAt, and no row at all means it's in the workshop.

import "server-only";
import { badRequest, conflict, forbidden, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, type Tx } from "@grid/db";
import { canSeeJob, getProject, myActiveJobs } from "@grid/block-projects";
import type { CheckOutInput, ReturnInput } from "./validation";

const MOD = "assets";
export const DEFAULT_STORE = "Workshop";

export type HolderKind = "STORE" | "PROJECT" | "USER" | "VEHICLE" | "ASSET";

/** Where an asset is now, ready to show. */
export interface Holder {
  kind: HolderKind;
  userId: string | null;
  userName: string | null;
  projectId: string | null;
  buildingId: string | null;
  levelId: string | null;
  /** The store's or van's name, or the job and area. */
  place: string | null;
  /** "With Sam T. · ED Refurbish · Level 5", "Workshop", "Van 3". */
  text: string;
  since: Date | null;
}

export interface Move {
  id: string;
  move: "CHECK_OUT" | "RETURN" | "TAKE_OVER" | "MOVE";
  holder: Holder;
  by: string;
  note: string | null;
  at: Date;
  until: Date | null;
}

type CustodyRow = Awaited<ReturnType<typeof db.assetCustody.findMany>>[number];

function holderText(kind: HolderKind, userName: string | null, place: string | null) {
  if (kind === "USER") return [`With ${userName ?? "someone who left"}`, place].filter(Boolean).join(" · ");
  if (kind === "PROJECT") return `On ${place ?? "a job"}`;
  return place ?? DEFAULT_STORE;
}

const IN_WORKSHOP: Holder = { kind: "STORE", userId: null, userName: null, projectId: null, buildingId: null, levelId: null, place: DEFAULT_STORE, text: DEFAULT_STORE, since: null };

function toHolder(row: CustodyRow, names: Map<string, string>): Holder {
  const userName = row.userId ? (names.get(row.userId) ?? null) : null;
  const place = row.holderType === "STORE" || row.holderType === "VEHICLE" ? (row.label ?? DEFAULT_STORE) : row.placeName;
  return {
    kind: row.holderType,
    userId: row.userId,
    userName,
    projectId: row.projectId,
    buildingId: row.buildingId,
    levelId: row.levelId,
    place,
    text: holderText(row.holderType, userName, place),
    since: row.fromAt,
  };
}

async function namesOf(ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return new Map<string, string>();
  const users = await db.user.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true } });
  return new Map(users.map((user) => [user.id, user.name]));
}

/** Where each asset is now (the workshop when it was never moved). */
export async function holdersFor(companyId: string, assetIds: string[]): Promise<Map<string, Holder>> {
  const rows = await db.assetCustody.findMany({ where: { companyId, assetId: { in: assetIds }, toAt: null } });
  const names = await namesOf(rows.map((row) => row.userId));
  const out = new Map<string, Holder>(assetIds.map((id) => [id, IN_WORKSHOP]));
  for (const row of rows) out.set(row.assetId, toHolder(row, names));
  return out;
}

/** The asset ids someone has now (the "With me" list). */
export async function heldBy(companyId: string, userId: string) {
  const rows = await db.assetCustody.findMany({ where: { companyId, userId, holderType: "USER", toAt: null }, select: { assetId: true } });
  return rows.map((row) => row.assetId);
}

export async function history(ctx: RequestContext, assetId: string): Promise<Move[]> {
  const companyId = requireCompany(ctx);
  const rows = await db.assetCustody.findMany({ where: { companyId, assetId }, orderBy: { fromAt: "desc" }, take: 200 });
  const names = await namesOf([...rows.map((row) => row.userId), ...rows.map((row) => row.byUserId)]);
  return rows.map((row) => ({ id: row.id, move: row.move, holder: toHolder(row, names), by: names.get(row.byUserId) ?? "Someone who left", note: row.note, at: row.fromAt, until: row.toAt }));
}

// ─── Moving it ───────────────────────────────────────────────────────────

/** A job and (optionally) its building or level, checked, with its name as it reads now. */
export async function placeOnJob(ctx: RequestContext, input: { projectId?: string | null; buildingId?: string | null; levelId?: string | null }) {
  if (!input.projectId) return null;
  if (!(await canSeeJob(ctx, input.projectId))) throw notFound("Job not found");
  const job = await getProject(ctx, input.projectId);
  let areaName: string | null = null;
  if (input.buildingId || input.levelId) {
    const area = job.areas.find((entry) => entry.buildingId === input.buildingId && (entry.levelId ?? null) === (input.levelId ?? null));
    if (!area) throw badRequest("That level isn't on this job");
    const several = new Set(job.areas.map((entry) => entry.buildingId)).size > 1;
    areaName = [several || !area.levelName ? area.buildingName : null, area.levelName].filter(Boolean).join(" ");
  }
  return { projectId: job.id, siteId: job.siteId, buildingId: input.buildingId ?? null, levelId: input.levelId ?? null, placeName: [job.name, areaName].filter(Boolean).join(" · ") };
}

async function ownAsset(tx: Tx, companyId: string, id: string) {
  const asset = await tx.asset.findFirst({ where: { id, companyId, deletedAt: null } });
  if (!asset) throw notFound("Asset not found");
  return asset;
}

/** Closes the current move and opens the next, in one go. */
export async function moveTo(
  tx: Tx,
  ctx: RequestContext,
  asset: { id: string; number: number; name: string; companyId: string },
  move: Move["move"],
  next: { holderType: HolderKind; userId?: string | null; projectId?: string | null; siteId?: string | null; buildingId?: string | null; levelId?: string | null; label?: string | null; placeName?: string | null },
  note: string | null,
) {
  // One move at a time per asset, so two people tapping at once don't both win.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assets:custody:${asset.id}`}))`;
  const now = new Date();
  await tx.assetCustody.updateMany({ where: { assetId: asset.id, toAt: null }, data: { toAt: now } });
  const row = await tx.assetCustody.create({ data: { companyId: asset.companyId, assetId: asset.id, move, note, fromAt: now, byUserId: ctx.userId, ...next } });
  await tx.asset.update({ where: { id: asset.id }, data: { lastSeenAt: now } });
  const diff = { number: asset.number, name: asset.name, to: next.holderType, userId: next.userId ?? undefined, place: next.placeName ?? next.label ?? undefined, note: note ?? undefined };
  await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: asset.companyId, projectId: next.projectId ?? undefined, entityType: "Asset", entityId: asset.id, action: move.toLowerCase(), diff });
  return row;
}

export async function currentRow(tx: Tx, assetId: string) {
  return tx.assetCustody.findFirst({ where: { assetId, toAt: null } });
}

const BLOCKED: Record<string, string> = {
  OUT_OF_SERVICE: "Do not use: a fault was reported. It can't be checked out until it's fixed.",
  IN_REPAIR: "It's in for repair, so it can't be checked out.",
  OVERDUE: "A test or inspection it must pass is overdue. Log a pass first.",
  RETIRED: "It's retired. Put it back in service first.",
  LOST: "It's reported lost. Mark it recovered first.",
};

export async function checkOut(ctx: RequestContext, id: string, input: CheckOutInput) {
  const companyId = requireCompany(ctx);
  const toSomeoneElse = !!input.userId && input.userId !== ctx.userId;
  if (toSomeoneElse && !ctx.permissions.has("assets.assign")) throw forbidden("Only a Foreman or Owner can check gear out to someone else");
  const userId = toSomeoneElse ? input.userId! : ctx.userId;
  if (toSomeoneElse) {
    const member = await db.membership.findFirst({ where: { companyId, userId, status: "ACTIVE" }, select: { id: true } });
    if (!member) throw badRequest("That person isn't in the business");
  }
  const place = await placeOnJob(ctx, input);
  await db.$transaction(async (tx) => {
    const asset = await ownAsset(tx, companyId, id);
    if (BLOCKED[asset.status]) throw conflict(BLOCKED[asset.status]!);
    const current = await currentRow(tx, id);
    if (current?.holderType === "USER" && current.userId !== userId && !ctx.permissions.has("assets.assign")) throw conflict("Someone else has it. Take it over instead.");
    await moveTo(tx, ctx, asset, current?.holderType === "USER" ? "MOVE" : "CHECK_OUT", { holderType: "USER", userId, ...place }, input.note);
  });
  return { ok: true };
}

export async function returnAsset(ctx: RequestContext, id: string, input: ReturnInput) {
  const companyId = requireCompany(ctx);
  const place = input.where === "PROJECT" ? await placeOnJob(ctx, input) : null;
  if (input.where === "PROJECT" && !place) throw badRequest("Pick the job it's left on");
  await db.$transaction(async (tx) => {
    const asset = await ownAsset(tx, companyId, id);
    const current = await currentRow(tx, id);
    const mine = current?.holderType === "USER" && current.userId === ctx.userId;
    if (!mine && !ctx.permissions.has("assets.assign")) throw forbidden(current?.holderType === "USER" ? "Someone else has it. Take it over first, or ask a Foreman." : "Only a Foreman or Owner can move gear nobody has checked out");
    const label = input.where === "PROJECT" ? null : input.label?.trim() || (input.where === "VEHICLE" ? null : DEFAULT_STORE);
    if (input.where === "VEHICLE" && !label) throw badRequest("Which van?");
    await moveTo(tx, ctx, asset, mine ? "RETURN" : "MOVE", { holderType: input.where, label, ...(place ?? {}) }, input.note);
  });
  return { ok: true };
}

/** Moves it to you from whoever had it; they see it in the asset's history (and a notification, once Grid has them). */
export async function takeOver(ctx: RequestContext, id: string, note: string | null) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const asset = await ownAsset(tx, companyId, id);
    if (BLOCKED[asset.status]) throw conflict(BLOCKED[asset.status]!);
    const current = await currentRow(tx, id);
    if (current?.holderType === "USER" && current.userId === ctx.userId) throw conflict("You've already got it");
    // Keep the job it was on: taking over on site is the usual case.
    await moveTo(
      tx,
      ctx,
      asset,
      current?.holderType === "USER" ? "TAKE_OVER" : "CHECK_OUT",
      { holderType: "USER", userId: ctx.userId, projectId: current?.projectId, siteId: current?.siteId, buildingId: current?.buildingId, levelId: current?.levelId, placeName: current?.placeName },
      note,
    );
  });
  return { ok: true };
}

// ─── What the sheets pick from ───────────────────────────────────────────

/** Active jobs (yours first), the stores and vans already used, and the team (for assigning). */
export async function places(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const [jobs, labels, members] = await Promise.all([
    myActiveJobs(ctx, 50),
    db.assetCustody.findMany({ where: { companyId, holderType: { in: ["STORE", "VEHICLE"] }, label: { not: null } }, distinct: ["holderType", "label"], select: { holderType: true, label: true }, take: 100 }),
    ctx.permissions.has("assets.assign") ? db.membership.findMany({ where: { companyId, status: "ACTIVE" }, select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } }) : Promise.resolve([]),
  ]);
  const stores = [...new Set([DEFAULT_STORE, ...labels.filter((row) => row.holderType === "STORE").map((row) => row.label!)])];
  const vans = [...new Set(labels.filter((row) => row.holderType === "VEHICLE").map((row) => row.label!))];
  return {
    jobs: jobs.map((job) => ({ id: job.id, name: job.name, siteName: job.siteName, jobNumber: job.jobNumber })),
    stores,
    vans,
    people: members.map((member) => ({ id: member.user.id, name: member.user.name })).filter((person) => person.id !== ctx.userId),
  };
}

/** A job's buildings and levels, for "where on the job". */
export async function jobAreas(ctx: RequestContext, projectId: string) {
  if (!(await canSeeJob(ctx, projectId))) throw notFound("Job not found");
  const job = await getProject(ctx, projectId);
  const several = new Set(job.areas.map((area) => area.buildingId)).size > 1;
  return job.areas.map((area) => ({ buildingId: area.buildingId, levelId: area.levelId, name: [several || !area.levelName ? area.buildingName : null, area.levelName].filter(Boolean).join(" ") }));
}
