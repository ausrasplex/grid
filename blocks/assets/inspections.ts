// Inspections and servicing (docs/assets-block.md §4), laid out like
// Docket's Service section: an asset's routines (from its category, and
// its own) with when each is next due, the log of tests, inspections and
// services done, and bookings. A pass restarts a routine's countdown; a
// fail opens a Failed test fault, Do not use. A must-pass routine past due
// makes the asset Overdue (it can't be checked out) until a pass is
// logged. The morning check (assets.morning) catches the day it tips over.

import "server-only";
import { badRequest, notFound, requireCompany, type RequestContext } from "@grid/core";
import { attachFile, audit, db, purgeStoredFile, routeCodeUrl, type Tx } from "@grid/db";
import { isOverdue, isTestAndTag, mostUrgent, nextInspectionDue, routineDue, today, type CheckLike, type Due, type RoutineLike } from "./due";
import { openFailedTest, refreshStatus } from "./faults";
import { tellManagers } from "./notify";
import type { BookingInput, CheckInput, RoutineInput } from "./validation";

const MOD = "assets";

const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

async function ownAsset(tx: Tx, companyId: string, id: string) {
  const asset = await tx.asset.findFirst({ where: { id, companyId, deletedAt: null } });
  if (!asset) throw notFound("Asset not found");
  return asset;
}

/** The routines an asset follows: its category's first, then its own. */
async function routinesOf(tx: Tx, asset: { id: string; categoryId: string | null }) {
  return tx.assetRoutine.findMany({
    where: { deletedAt: null, OR: [{ assetId: asset.id }, ...(asset.categoryId ? [{ categoryId: asset.categoryId }] : [])] },
    include: { category: { select: { name: true } } },
    orderBy: [{ assetId: { sort: "asc", nulls: "first" } }, { sort: "asc" }, { createdAt: "asc" }],
  });
}

const checkLike = (row: { date: Date; routineIds: string[]; result: "PASS" | "FAIL" }): CheckLike => ({ date: dayOf(row.date), routineIds: row.routineIds, result: row.result });

/** Works out the asset's next must-pass due date again, then its status. */
export async function refreshDue(tx: Tx, assetId: string) {
  const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId }, select: { id: true, categoryId: true, nextInspectionDue: true } });
  const [routines, checks] = await Promise.all([
    routinesOf(tx, asset),
    tx.assetCheck.findMany({ where: { assetId, deletedAt: null }, select: { date: true, routineIds: true, result: true } }),
  ]);
  const next = nextInspectionDue(routines, checks.map(checkLike));
  if ((asset.nextInspectionDue ? dayOf(asset.nextInspectionDue) : null) !== next) {
    await tx.asset.update({ where: { id: assetId }, data: { nextInspectionDue: next ? asDate(next) : null } });
  }
  return refreshStatus(tx, assetId);
}

/** Every asset in a category, after its routines change. */
export async function refreshCategory(tx: Tx, categoryId: string) {
  const assets = await tx.asset.findMany({ where: { categoryId, deletedAt: null }, select: { id: true } });
  for (const asset of assets) await refreshDue(tx, asset.id);
}

// ─── The asset page's section ───────────────────────────────────────────

export interface RoutineView {
  id: string;
  name: string;
  everyMonths: number | null;
  mustPass: boolean;
  notes: string | null;
  /** The category it comes from (changed in Settings › Asset categories), or null for the asset's own. */
  from: string | null;
  /** "Every 3 months", "No set interval". */
  interval: string;
  due: Due;
  /** The latest check that counts for it. */
  lastDone: string | null;
  booked: { id: string; date: string; withWho: string | null; past: boolean } | null;
}

export interface CheckView {
  id: string;
  date: string;
  title: string;
  routineIds: string[];
  result: "PASS" | "FAIL";
  doneBy: string | null;
  tagColour: string | null;
  cost: string | null;
  fileIds: string[];
  /** The certificates, photos and invoices, with their names (a PDF shows as a file, a picture as a thumbnail). */
  files: { id: string; name: string; image: boolean }[];
  notes: string | null;
  faultId: string | null;
  by: string;
}

export const intervalText = (everyMonths: number | null) => (everyMonths ? `Every ${everyMonths === 12 ? "year" : everyMonths % 12 === 0 ? `${everyMonths / 12} years` : `${everyMonths} month${everyMonths === 1 ? "" : "s"}`}` : "No set interval");

export async function serviceFor(ctx: RequestContext, assetId: string) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(db, companyId, assetId);
  const [routines, checks, bookings] = await Promise.all([
    routinesOf(db, asset),
    db.assetCheck.findMany({ where: { assetId, deletedAt: null }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    db.assetBooking.findMany({ where: { assetId, closedAt: null }, orderBy: { date: "asc" } }),
  ]);
  const todayIs = today();
  const likes = checks.map(checkLike);
  const [users, stored] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...new Set(checks.map((check) => check.byUserId))] } }, select: { id: true, name: true } }),
    db.storedFile.findMany({ where: { companyId, id: { in: checks.flatMap((check) => check.fileIds) } }, select: { id: true, originalName: true, mime: true } }),
  ]);
  const people = new Map(users.map((user) => [user.id, user.name]));
  const fileInfo = new Map(stored.map((file) => [file.id, { id: file.id, name: file.originalName ?? "File", image: file.mime.startsWith("image/") }]));
  const routineViews: RoutineView[] = routines.map((routine) => {
    const booking = bookings.find((entry) => entry.routineIds.includes(routine.id)) ?? null;
    const due = routineDue(routine, likes, todayIs);
    const done = likes.filter((check) => check.routineIds.includes(routine.id) && (!routine.mustPass || check.result === "PASS")).map((check) => check.date).sort().at(-1) ?? null;
    return {
      id: routine.id,
      name: routine.name,
      everyMonths: routine.everyMonths,
      mustPass: routine.mustPass,
      notes: routine.notes,
      from: routine.assetId ? null : (routine.category?.name ?? "its category"),
      interval: intervalText(routine.everyMonths),
      due,
      lastDone: done,
      booked: booking ? { id: booking.id, date: dayOf(booking.date), withWho: booking.withWho, past: dayOf(booking.date) < todayIs } : null,
    };
  });
  return {
    enabled: asset.serviceEnabled,
    routines: routineViews,
    checks: checks.map(
      (check): CheckView => ({
        id: check.id,
        date: dayOf(check.date),
        title: check.title,
        routineIds: check.routineIds,
        result: check.result,
        doneBy: check.doneBy,
        tagColour: check.tagColour,
        cost: check.cost ? check.cost.toFixed(2) : null,
        fileIds: check.fileIds,
        files: check.fileIds.map((id) => fileInfo.get(id) ?? { id, name: "File", image: false }),
        notes: check.notes,
        faultId: check.faultId,
        by: people.get(check.byUserId) ?? "Someone who left",
      }),
    ),
  };
}

/** The most urgent routine per asset, for the list's chips. */
export async function dueChips(companyId: string, assetIds: string[]): Promise<Map<string, Due>> {
  const out = new Map<string, Due>();
  if (!assetIds.length) return out;
  const assets = await db.asset.findMany({ where: { id: { in: assetIds }, companyId }, select: { id: true, categoryId: true, serviceEnabled: true } });
  const categoryIds = [...new Set(assets.flatMap((asset) => (asset.categoryId ? [asset.categoryId] : [])))];
  const [routines, checks] = await Promise.all([
    db.assetRoutine.findMany({ where: { companyId, deletedAt: null, OR: [{ assetId: { in: assetIds } }, { categoryId: { in: categoryIds } }] } }),
    db.assetCheck.findMany({ where: { companyId, assetId: { in: assetIds }, deletedAt: null }, select: { assetId: true, date: true, routineIds: true, result: true } }),
  ]);
  const todayIs = today();
  for (const asset of assets) {
    const own = routines.filter((routine) => routine.assetId === asset.id || (!!asset.categoryId && routine.categoryId === asset.categoryId));
    if (!own.length) continue;
    const likes = checks.filter((check) => check.assetId === asset.id).map(checkLike);
    const urgent = mostUrgent(own.map((routine) => ({ ...routineDue(routine, likes, todayIs), text: `${routine.name}: ${routineDue(routine, likes, todayIs).text}` })));
    if (urgent) out.set(asset.id, urgent);
  }
  return out;
}

// ─── An asset's own routines ────────────────────────────────────────────

export async function saveRoutine(ctx: RequestContext, assetId: string, id: string | null, input: RoutineInput) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(db, companyId, assetId);
  await db.$transaction(async (tx) => {
    let routineId = id;
    if (id) {
      const before = await tx.assetRoutine.findFirst({ where: { id, assetId, companyId, deletedAt: null } });
      if (!before) throw notFound("That routine isn't there any more. A category's routines are changed in Settings › Asset categories.");
      await tx.assetRoutine.update({ where: { id }, data: { name: input.name, everyMonths: input.everyMonths ?? null, mustPass: input.mustPass, notes: input.notes } });
    } else {
      const last = await tx.assetRoutine.aggregate({ where: { assetId }, _max: { sort: true } });
      routineId = (await tx.assetRoutine.create({ data: { companyId, assetId, name: input.name, everyMonths: input.everyMonths ?? null, mustPass: input.mustPass, notes: input.notes, sort: (last._max.sort ?? 0) + 1 } })).id;
    }
    // Adding a routine shows the section again.
    if (!asset.serviceEnabled) await tx.asset.update({ where: { id: assetId }, data: { serviceEnabled: true } });
    await refreshDue(tx, assetId);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetRoutine", entityId: routineId!, action: id ? "updated" : "created", diff: { asset: asset.number, name: input.name, everyMonths: input.everyMonths ?? undefined, mustPass: input.mustPass || undefined } });
  });
  return serviceFor(ctx, assetId);
}

/** Removes one of the asset's own routines. Its past checks stay in the log. */
export async function removeRoutine(ctx: RequestContext, assetId: string, id: string) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(db, companyId, assetId);
  await db.$transaction(async (tx) => {
    const before = await tx.assetRoutine.findFirst({ where: { id, assetId, companyId, deletedAt: null } });
    if (!before) throw notFound("That routine isn't there any more");
    await tx.assetRoutine.update({ where: { id }, data: { deletedAt: new Date() } });
    await refreshDue(tx, assetId);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetRoutine", entityId: id, action: "removed", diff: { asset: asset.number, name: before.name } });
  });
  return serviceFor(ctx, assetId);
}

// ─── The log ────────────────────────────────────────────────────────────

/** Log a test, inspection or service (or change one). A new fail opens a Failed test fault. */
export async function saveCheck(ctx: RequestContext, assetId: string, id: string | null, input: CheckInput) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(db, companyId, assetId);
  if (asset.status === "RETIRED") throw badRequest("It's retired. Put it back in service first.");
  if (input.date > today()) throw badRequest("That date hasn't happened yet. Book it in instead.");
  const routines = await routinesOf(db, asset);
  const covered = [...new Set(input.routineIds)];
  if (covered.some((routineId) => !routines.some((routine) => routine.id === routineId))) throw badRequest("One of those routines isn't on this asset any more");
  const coveredNames = routines.filter((routine) => covered.includes(routine.id)).map((routine) => routine.name);
  const files = [...new Set(input.fileIds)];

  const saved = await db.$transaction(async (tx) => {
    const before = id ? await tx.assetCheck.findFirst({ where: { id, assetId, companyId, deletedAt: null } }) : null;
    if (id && !before) throw notFound("That check isn't in the log any more");
    for (const fileId of files) if (!before?.fileIds.includes(fileId)) await attachFile(tx, fileId, { companyId, userId: ctx.userId, blockId: MOD });
    for (const fileId of before?.fileIds ?? []) if (!files.includes(fileId)) await purgeStoredFile(tx, fileId);
    const data = {
      date: asDate(input.date),
      routineIds: covered,
      title: input.title,
      result: input.result,
      doneBy: input.doneBy,
      tagColour: coveredNames.some(isTestAndTag) || isTestAndTag(input.title) ? input.tagColour : null,
      cost: input.cost,
      fileIds: files,
      notes: input.notes,
    };
    let row = before ? await tx.assetCheck.update({ where: { id: before.id }, data }) : await tx.assetCheck.create({ data: { ...data, companyId, assetId, byUserId: ctx.userId } });
    // A fail opens a Failed test fault, Do not use (only the first time it's marked failed).
    let faultOpened = false;
    if (input.result === "FAIL" && !row.faultId) {
      const faultId = await openFailedTest(tx, ctx, asset, [`Failed ${input.title}`, input.notes].filter(Boolean).join(": "));
      row = await tx.assetCheck.update({ where: { id: row.id }, data: { faultId } });
      faultOpened = true;
    }
    // A booking for what it covered is done.
    if (!before && covered.length) {
      await tx.assetBooking.updateMany({ where: { assetId, closedAt: null, routineIds: { hasSome: covered } }, data: { closedAt: new Date(), closedHow: "LOGGED" } });
    }
    const status = await refreshDue(tx, assetId);
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "AssetCheck",
      entityId: row.id,
      action: before ? "updated" : "logged",
      diff: { asset: asset.number, name: asset.name, title: input.title, date: input.date, result: input.result, routines: coveredNames, doneBy: input.doneBy ?? undefined, cost: input.cost ?? undefined },
    });
    return { row, status, faultOpened };
  });

  if (saved.faultOpened) {
    await tellManagers(companyId, ctx.userId, {
      subject: `DO NOT USE: Asset No. ${asset.number}, ${asset.name} failed ${input.title}`,
      text: [`Asset No. ${asset.number}, ${asset.name}, failed ${input.title} on ${input.date}${input.doneBy ? ` (${input.doneBy})` : ""}. It's marked Do not use until it's fixed.`, input.notes ? `\n"${input.notes}"` : null, `\nOpen it: ${routeCodeUrl(asset.tagCode)}`].filter(Boolean).join("\n"),
    });
  }
  return serviceFor(ctx, assetId);
}

/** Takes a check out of the log; its files go. The fault it opened stays. */
export async function deleteCheck(ctx: RequestContext, assetId: string, id: string) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(db, companyId, assetId);
  await db.$transaction(async (tx) => {
    const before = await tx.assetCheck.findFirst({ where: { id, assetId, companyId, deletedAt: null } });
    if (!before) throw notFound("That check isn't in the log any more");
    for (const fileId of before.fileIds) await purgeStoredFile(tx, fileId);
    await tx.assetCheck.update({ where: { id }, data: { deletedAt: new Date(), fileIds: [] } });
    await refreshDue(tx, assetId);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetCheck", entityId: id, action: "deleted", diff: { asset: asset.number, title: before.title, date: dayOf(before.date) } });
  });
  return serviceFor(ctx, assetId);
}

// ─── Bookings ───────────────────────────────────────────────────────────

export async function book(ctx: RequestContext, assetId: string, input: BookingInput) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(db, companyId, assetId);
  const routines = await routinesOf(db, asset);
  if (input.routineIds.some((routineId) => !routines.some((routine) => routine.id === routineId))) throw badRequest("One of those routines isn't on this asset any more");
  if (input.date < today()) throw badRequest("Pick today or a day coming up");
  await db.$transaction(async (tx) => {
    // One booking per routine: a new one replaces the old.
    await tx.assetBooking.updateMany({ where: { assetId, closedAt: null, routineIds: { hasSome: input.routineIds } }, data: { closedAt: new Date(), closedHow: "REPLACED" } });
    const row = await tx.assetBooking.create({ data: { companyId, assetId, routineIds: input.routineIds, date: asDate(input.date), withWho: input.withWho, byUserId: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetBooking", entityId: row.id, action: "booked", diff: { asset: asset.number, date: input.date, withWho: input.withWho ?? undefined } });
  });
  return serviceFor(ctx, assetId);
}

/** "Cancel booking", or "It didn't happen" for one whose day has passed. */
export async function cancelBooking(ctx: RequestContext, assetId: string, bookingId: string) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(db, companyId, assetId);
  await db.$transaction(async (tx) => {
    const row = await tx.assetBooking.findFirst({ where: { id: bookingId, assetId, companyId, closedAt: null } });
    if (!row) throw notFound("That booking isn't there any more");
    await tx.assetBooking.update({ where: { id: bookingId }, data: { closedAt: new Date(), closedHow: "CANCELLED" } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetBooking", entityId: bookingId, action: "cancelled", diff: { asset: asset.number, date: dayOf(row.date) } });
  });
  return serviceFor(ctx, assetId);
}

/** Turns the section on or off (the asset's "Track tests and servicing"). */
export async function setServiceEnabled(tx: Tx, asset: { id: string; categoryId: string | null }, enabled: boolean) {
  // It stays on while its category has routines.
  const fromCategory = asset.categoryId ? await tx.assetRoutine.count({ where: { categoryId: asset.categoryId, deletedAt: null } }) : 0;
  await tx.asset.update({ where: { id: asset.id }, data: { serviceEnabled: enabled || fromCategory > 0 } });
}

// ─── Home and the morning check ─────────────────────────────────────────

/** Home's counts: gear overdue, and must-pass routines due in the next 14 days. */
export async function dueCounts(companyId: string) {
  const todayIs = today();
  const fortnight = new Date(`${todayIs}T00:00:00Z`);
  fortnight.setUTCDate(fortnight.getUTCDate() + 14);
  const [overdue, soon] = await Promise.all([
    db.asset.count({ where: { companyId, deletedAt: null, status: "OVERDUE" } }),
    db.asset.count({ where: { companyId, deletedAt: null, status: { notIn: ["RETIRED", "LOST", "OVERDUE"] }, nextInspectionDue: { gte: asDate(todayIs), lte: fortnight } } }),
  ]);
  return { overdue, soon };
}

/**
 * Every morning: gear whose must-pass routine tipped past due becomes
 * Overdue, and each business's Owners and Foremen get one email listing it.
 */
export async function morningCheck(): Promise<void> {
  const todayIs = today();
  const rows = await db.asset.findMany({
    where: { deletedAt: null, nextInspectionDue: { lt: asDate(todayIs) }, status: { notIn: ["OVERDUE", "RETIRED", "LOST", "OUT_OF_SERVICE"] } },
    select: { id: true, companyId: true, number: true, name: true, tagCode: true, nextInspectionDue: true },
  });
  const tipped = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!isOverdue(row.nextInspectionDue ? dayOf(row.nextInspectionDue) : null, todayIs)) continue;
    const status = await db.$transaction((tx) => refreshStatus(tx, row.id));
    if (status === "OVERDUE") tipped.set(row.companyId, [...(tipped.get(row.companyId) ?? []), row]);
  }
  for (const [companyId, assets] of tipped) {
    const lines = assets.map((asset) => `- Asset No. ${asset.number}, ${asset.name} (due ${asset.nextInspectionDue ? dayOf(asset.nextInspectionDue) : "?"}): ${routeCodeUrl(asset.tagCode)}`);
    await tellManagers(companyId, "", {
      subject: assets.length === 1 ? `Overdue: Asset No. ${assets[0]!.number}, ${assets[0]!.name}` : `${assets.length} assets are overdue for a test or inspection`,
      text: `These are now overdue for a test or inspection they must pass, so they can't be checked out until a pass is logged:\n\n${lines.join("\n")}\n`,
    });
  }
}

export type { RoutineLike };
