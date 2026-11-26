// Faults (docs/assets-block.md §3): report one (type, note, photos, Do not
// use for anything unsafe), add to the open report instead of making a
// second, and move it along: Acknowledged → In repair → Fixed (or Retired),
// with a note, a person and a time on every step. The asset's status
// follows its open faults (status.ts). Lost or stolen is in lost.ts.

import "server-only";
import { app, badRequest, conflict, notFound, requireCompany, type RequestContext } from "@grid/core";
import { attachFile, audit, db, routeCodeUrl, type Tx } from "@grid/db";
import { currentRow } from "./custody";
import { tellManagers } from "./notify";
import { isOverdue, today } from "./due";
import { nextSteps, statusFor } from "./status";
import type { FaultInput, FaultStepInput } from "./validation";

const MOD = "assets";

export const FAULT_TYPES: Record<string, string> = {
  FAULTY: "Faulty",
  DAMAGED: "Damaged",
  MISSING_PARTS: "Missing parts",
  FAILED_TEST: "Failed test",
  OTHER: "Other",
};
export const STEP_WORDS: Record<string, string> = {
  REPORTED: "Reported",
  ACKNOWLEDGED: "Acknowledged",
  IN_REPAIR: "In repair",
  FIXED: "Fixed",
  RETIRED: "Retired",
};

/** Works the asset's status out again from what's open on it. */
export async function refreshStatus(tx: Tx, assetId: string, retired?: boolean) {
  const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId }, select: { status: true, nextInspectionDue: true } });
  const [faults, losses] = await Promise.all([
    tx.assetFault.findMany({ where: { assetId, closedAt: null }, select: { doNotUse: true, status: true } }),
    tx.assetLoss.count({ where: { assetId, recoveredAt: null, retiredAt: null } }),
  ]);
  const overdue = isOverdue(asset.nextInspectionDue?.toISOString().slice(0, 10) ?? null, today());
  const status = statusFor({ retired: retired ?? asset.status === "RETIRED", lossOpen: losses > 0, faults, overdue });
  if (status !== asset.status) await tx.asset.update({ where: { id: assetId }, data: { status } });
  return status;
}

/**
 * A failed test or inspection opens a Failed test fault, Do not use
 * (§4), inside the check's own transaction. Returns the fault's id.
 */
export async function openFailedTest(tx: Tx, ctx: RequestContext, asset: { id: string; companyId: string }, note: string) {
  const where = await currentRow(tx, asset.id);
  const fault = await tx.assetFault.create({
    data: {
      companyId: asset.companyId,
      assetId: asset.id,
      type: "FAILED_TEST",
      doNotUse: true,
      note,
      reportedById: ctx.userId,
      projectId: where?.projectId,
      siteId: where?.siteId,
      buildingId: where?.buildingId,
      levelId: where?.levelId,
      placeName: where?.placeName ?? where?.label ?? null,
    },
  });
  await tx.assetFaultEvent.create({ data: { faultId: fault.id, status: "REPORTED", note, doNotUse: true, byUserId: ctx.userId } });
  return fault.id;
}

async function ownAsset(companyId: string, id: string) {
  const asset = await db.asset.findFirst({ where: { id, companyId, deletedAt: null } });
  if (!asset) throw notFound("Asset not found");
  return asset;
}

async function names(ids: string[]) {
  const users = await db.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
  return new Map(users.map((user) => [user.id, user.name]));
}

export interface FaultView {
  id: string;
  type: string;
  doNotUse: boolean;
  note: string | null;
  photoFileIds: string[];
  status: string;
  open: boolean;
  reportedBy: string;
  reportedAt: Date;
  placeName: string | null;
  hasLocation: boolean;
  next: string[];
  events: { id: string; status: string | null; note: string | null; photoFileIds: string[]; doNotUse: boolean; by: string; at: Date }[];
}

/** An asset's faults, newest first, each with its steps. */
export async function faultsFor(ctx: RequestContext, assetId: string): Promise<FaultView[]> {
  const companyId = requireCompany(ctx);
  await ownAsset(companyId, assetId);
  const rows = await db.assetFault.findMany({ where: { companyId, assetId }, include: { events: { orderBy: { at: "asc" } } }, orderBy: { reportedAt: "desc" }, take: 100 });
  const people = await names(rows.flatMap((row) => [row.reportedById, ...row.events.map((event) => event.byUserId)]));
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    doNotUse: row.doNotUse,
    note: row.note,
    photoFileIds: row.photoFileIds,
    status: row.status,
    open: !row.closedAt,
    reportedBy: people.get(row.reportedById) ?? "Someone who left",
    reportedAt: row.reportedAt,
    placeName: row.placeName,
    hasLocation: row.lat !== null,
    next: row.closedAt ? [] : nextSteps(row.status),
    events: row.events.map((event) => ({ id: event.id, status: event.status, note: event.note, photoFileIds: event.photoFileIds, doNotUse: event.doNotUse, by: people.get(event.byUserId) ?? "Someone who left", at: event.at })),
  }));
}

/**
 * Reports a fault, or (addTo) adds to the open one: more notes and photos,
 * and Do not use if it's now unsafe. Where it was comes from its custody.
 */
export async function reportFault(ctx: RequestContext, assetId: string, input: FaultInput) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(companyId, assetId);
  if (asset.status === "RETIRED") throw conflict("It's retired. Put it back in service first.");
  const photos = [...new Set(input.photoFileIds)];
  const result = await db.$transaction(async (tx) => {
    for (const fileId of photos) await attachFile(tx, fileId, { companyId, userId: ctx.userId, blockId: MOD });
    let faultId: string;
    let added = false;
    if (input.addTo) {
      const fault = await tx.assetFault.findFirst({ where: { id: input.addTo, assetId, companyId, closedAt: null } });
      if (!fault) throw notFound("That report has been closed. Report a new fault instead.");
      faultId = fault.id;
      added = true;
      const unsafe = input.doNotUse && !fault.doNotUse;
      if (unsafe) await tx.assetFault.update({ where: { id: fault.id }, data: { doNotUse: true } });
      await tx.assetFaultEvent.create({ data: { faultId, note: input.note, photoFileIds: photos, doNotUse: unsafe, byUserId: ctx.userId } });
    } else {
      const open = await tx.assetFault.findFirst({ where: { assetId, closedAt: null }, select: { id: true } });
      if (open && !input.anyway) throw conflict("There's already an open fault on it. Add to that report, or report a new fault anyway.");
      const where = await currentRow(tx, assetId);
      const fault = await tx.assetFault.create({
        data: {
          companyId,
          assetId,
          type: input.type,
          doNotUse: input.doNotUse,
          note: input.note,
          photoFileIds: photos,
          reportedById: ctx.userId,
          projectId: where?.projectId,
          siteId: where?.siteId,
          buildingId: where?.buildingId,
          levelId: where?.levelId,
          placeName: where?.placeName ?? where?.label ?? null,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
        },
      });
      faultId = fault.id;
      await tx.assetFaultEvent.create({ data: { faultId, status: "REPORTED", note: input.note, doNotUse: input.doNotUse, byUserId: ctx.userId } });
    }
    const status = await refreshStatus(tx, assetId);
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "AssetFault",
      entityId: faultId,
      action: added ? "added_to" : "reported",
      diff: { asset: asset.number, name: asset.name, type: input.type, doNotUse: input.doNotUse, note: input.note ?? undefined, photos: photos.length || undefined },
    });
    return { faultId, status, added };
  });

  const reporter = (await names([ctx.userId])).get(ctx.userId) ?? "Someone";
  const unsafe = input.doNotUse ? "DO NOT USE: " : "";
  await tellManagers(companyId, ctx.userId, {
    subject: `${unsafe}Fault on Asset No. ${asset.number}, ${asset.name}`,
    text: [
      `${reporter} ${result.added ? "added to the fault report on" : "reported a fault on"} Asset No. ${asset.number}, ${asset.name}.`,
      `${FAULT_TYPES[input.type] ?? "Fault"}${input.doNotUse ? ", marked Do not use: nobody should use it until it's fixed." : "."}`,
      input.note ? `\n"${input.note}"` : null,
      `\nOpen it: ${routeCodeUrl(asset.tagCode)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return result;
}

/** Moves a fault along (assets.faults.manage), or adds a note to it. */
export async function faultStep(ctx: RequestContext, faultId: string, input: FaultStepInput) {
  const companyId = requireCompany(ctx);
  const fault = await db.assetFault.findFirst({ where: { id: faultId, companyId }, include: { asset: { select: { id: true, number: true, name: true } } } });
  if (!fault) throw notFound("That fault isn't there any more");
  if (fault.closedAt) throw conflict("That fault has been closed");
  if (input.status && !nextSteps(fault.status).includes(input.status)) throw badRequest("That step doesn't come next");
  if (!input.status && !input.note) throw badRequest("Add a note, or pick the next step");
  const closes = input.status === "FIXED" || input.status === "RETIRED";
  const status = await db.$transaction(async (tx) => {
    await tx.assetFault.update({ where: { id: faultId }, data: { ...(input.status ? { status: input.status } : {}), ...(closes ? { closedAt: new Date() } : {}) } });
    await tx.assetFaultEvent.create({ data: { faultId, status: input.status ?? null, note: input.note, byUserId: ctx.userId } });
    const next = await refreshStatus(tx, fault.assetId, input.status === "RETIRED" ? true : undefined);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetFault", entityId: faultId, action: input.status ? input.status.toLowerCase() : "noted", diff: { asset: fault.asset.number, name: fault.asset.name, note: input.note ?? undefined } });
    return next;
  });
  // The reporter hears it's fixed (by email for now).
  if (input.status === "FIXED" && fault.reportedById !== ctx.userId) {
    const reporter = await db.user.findUnique({ where: { id: fault.reportedById }, select: { email: true } });
    if (reporter?.email && (await app().mail.configured().catch(() => false))) {
      await app()
        .mail.send({ to: reporter.email, subject: `Fixed: Asset No. ${fault.asset.number}, ${fault.asset.name}`, text: `The fault you reported on Asset No. ${fault.asset.number}, ${fault.asset.name}, is fixed.${input.note ? `\n\n"${input.note}"` : ""}` })
        .catch((error: unknown) => console.error("[assets] couldn't email the reporter", error));
    }
  }
  return { status };
}

/** Open faults across the business (the Faults page), Do not use first. */
export async function openFaults(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const rows = await db.assetFault.findMany({
    where: { companyId, closedAt: null, asset: { deletedAt: null } },
    include: { asset: { select: { id: true, number: true, name: true, photoFileIds: true } } },
    orderBy: [{ doNotUse: "desc" }, { reportedAt: "asc" }],
  });
  const people = await names(rows.map((row) => row.reportedById));
  return rows.map((row) => ({
    id: row.id,
    asset: row.asset,
    type: row.type,
    doNotUse: row.doNotUse,
    status: row.status,
    note: row.note,
    placeName: row.placeName,
    reportedBy: people.get(row.reportedById) ?? "Someone who left",
    reportedAt: row.reportedAt,
  }));
}

/** Home's counts: open Do-not-use faults, other open faults, lost or stolen. */
export async function attention(companyId: string) {
  const [unsafe, faults, lost] = await Promise.all([
    db.assetFault.count({ where: { companyId, closedAt: null, doNotUse: true, asset: { deletedAt: null } } }),
    db.assetFault.count({ where: { companyId, closedAt: null, doNotUse: false, asset: { deletedAt: null } } }),
    db.assetLoss.findMany({ where: { companyId, recoveredAt: null, retiredAt: null, asset: { deletedAt: null } }, select: { kind: true, asset: { select: { id: true, number: true, name: true } } } }),
  ]);
  return { unsafe, faults, lost };
}
