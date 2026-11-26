// Lost or stolen (docs/assets-block.md §3a): anyone in the business can
// report it, with the last known whereabouts filled in from its custody.
// Owners and Foremen hear straight away. Recovered clears it and checks
// the asset in wherever it is now; Retire as lost (Owner) takes it off the
// list but keeps its history and tag, so a later scan is still recognised.
// The public tag page and sightings come with §10.

import "server-only";
import { conflict, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, routeCodeUrl } from "@grid/db";
import { holdersFor, moveTo, placeOnJob, DEFAULT_STORE } from "./custody";
import { refreshStatus } from "./faults";
import { tellManagers } from "./notify";
import type { LostInput, ReturnInput } from "./validation";

const MOD = "assets";

const when = (at: Date) => at.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: process.env.TZ || "Australia/Melbourne" });

async function ownAsset(companyId: string, id: string) {
  const asset = await db.asset.findFirst({ where: { id, companyId, deletedAt: null } });
  if (!asset) throw notFound("Asset not found");
  return asset;
}

/** "With Sam T. · ED Refurbish · Level 5, Tue 3 Mar, 7:02 am": for the Lost sheet to start from. */
export async function lastKnown(ctx: RequestContext, assetId: string) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(companyId, assetId);
  const holder = (await holdersFor(companyId, [assetId])).get(assetId)!;
  const seen = holder.since ?? asset.lastSeenAt;
  return { text: [holder.text, seen ? when(seen) : null].filter(Boolean).join(", ") };
}

export interface LossView {
  id: string;
  kind: "LOST" | "STOLEN";
  lastKnown: string | null;
  note: string | null;
  policeReport: string | null;
  reportedBy: string;
  reportedAt: Date;
  retired: boolean;
}

/** The open (or retired-as-lost) report on an asset, if there is one. */
export async function currentLoss(ctx: RequestContext, assetId: string): Promise<LossView | null> {
  const companyId = requireCompany(ctx);
  const row = await db.assetLoss.findFirst({ where: { companyId, assetId, recoveredAt: null }, orderBy: { reportedAt: "desc" } });
  if (!row) return null;
  const by = await db.user.findUnique({ where: { id: row.reportedById }, select: { name: true } });
  return { id: row.id, kind: row.kind, lastKnown: row.lastKnown, note: row.note, policeReport: row.policeReport, reportedBy: by?.name ?? "Someone who left", reportedAt: row.reportedAt, retired: !!row.retiredAt };
}

export async function reportLost(ctx: RequestContext, assetId: string, input: LostInput) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(companyId, assetId);
  if (asset.status === "RETIRED") throw conflict("It's retired. Put it back in service first.");
  await db.$transaction(async (tx) => {
    if (await tx.assetLoss.findFirst({ where: { assetId, recoveredAt: null, retiredAt: null }, select: { id: true } })) throw conflict("It's already reported lost");
    const row = await tx.assetLoss.create({ data: { companyId, assetId, kind: input.kind, lastKnown: input.lastKnown, note: input.note, policeReport: input.kind === "STOLEN" ? input.policeReport : null, reportedById: ctx.userId } });
    await refreshStatus(tx, assetId);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetLoss", entityId: row.id, action: input.kind === "STOLEN" ? "reported_stolen" : "reported_lost", diff: { asset: asset.number, name: asset.name, lastKnown: input.lastKnown ?? undefined } });
  });
  const reporter = (await db.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }))?.name ?? "Someone";
  const word = input.kind === "STOLEN" ? "stolen" : "lost";
  await tellManagers(companyId, ctx.userId, {
    subject: `${input.kind === "STOLEN" ? "Stolen" : "Lost"}: Asset No. ${asset.number}, ${asset.name}`,
    text: [
      `${reporter} reported Asset No. ${asset.number}, ${asset.name}, as ${word}.`,
      input.lastKnown ? `Last known: ${input.lastKnown}.` : null,
      input.policeReport ? `Police report: ${input.policeReport}.` : null,
      input.note ? `\n"${input.note}"` : null,
      `\nOpen it: ${routeCodeUrl(asset.tagCode)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return { ok: true };
}

/** Found: clears Lost (or a retirement as lost) and checks it in where it is now. */
export async function recover(ctx: RequestContext, assetId: string, input: ReturnInput) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(companyId, assetId);
  const place = input.where === "PROJECT" ? await placeOnJob(ctx, input) : null;
  await db.$transaction(async (tx) => {
    const loss = await tx.assetLoss.findFirst({ where: { assetId, recoveredAt: null }, orderBy: { reportedAt: "desc" } });
    if (!loss) throw conflict("It isn't reported lost");
    await tx.assetLoss.update({ where: { id: loss.id }, data: { recoveredAt: new Date(), recoveredById: ctx.userId } });
    const label = input.where === "PROJECT" ? null : input.label?.trim() || (input.where === "VEHICLE" ? "Van" : DEFAULT_STORE);
    await moveTo(tx, ctx, asset, "RETURN", { holderType: input.where, label, ...(place ?? {}) }, input.note ?? "Recovered");
    // Retired as lost, now found: it comes back into service.
    await refreshStatus(tx, assetId, loss.retiredAt ? false : undefined);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetLoss", entityId: loss.id, action: "recovered", diff: { asset: asset.number, name: asset.name } });
  });
  return { ok: true };
}

/** Owner: off the active list for good, keeping its history and tag record. */
export async function retireLost(ctx: RequestContext, assetId: string) {
  const companyId = requireCompany(ctx);
  const asset = await ownAsset(companyId, assetId);
  await db.$transaction(async (tx) => {
    const loss = await tx.assetLoss.findFirst({ where: { assetId, recoveredAt: null, retiredAt: null } });
    if (!loss) throw conflict("It isn't reported lost");
    await tx.assetLoss.update({ where: { id: loss.id }, data: { retiredAt: new Date(), retiredById: ctx.userId } });
    await refreshStatus(tx, assetId, true);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetLoss", entityId: loss.id, action: "retired_as_lost", diff: { asset: asset.number, name: asset.name } });
  });
  return { ok: true };
}
