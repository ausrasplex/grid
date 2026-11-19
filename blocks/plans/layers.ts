// Layers on a plan sheet (docs/plans-block.md "Layers"): Power, Data,
// Lighting; Water, Drainage. Every sheet has Default without a row (null);
// these are the ones people add. Markups and photo pins keep the layer's id
// (their Blocks own them); a layer that's gone counts as Default, and
// "plans.layerDeleted" lets those Blocks move things back to it.

import "server-only";
import { app, badRequest, forbidden, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db } from "@grid/db";
import { sheetForOverlay } from "./service";

const MOD = "plans";

export interface LayerView {
  id: string;
  name: string;
  /** You made it, or you may change anyone's (plans.manage). */
  canChange: boolean;
}

/** Payload of "plans.layerDeleted": put what was on it back on Default. */
export interface LayerDeletedEvent {
  layerId: string;
  sheetId: string;
  companyId: string;
}

const canChange = (ctx: RequestContext, createdById: string) => createdById === ctx.userId || ctx.permissions.has("plans.manage");

/** A sheet's layers (oldest first), for the viewer. */
export async function sheetLayers(ctx: RequestContext, sheetId: string): Promise<LayerView[]> {
  const sheet = await sheetForOverlay(ctx, sheetId);
  const rows = await db.planLayer.findMany({ where: { sheetId: sheet.id, companyId: sheet.companyId, deletedAt: null }, orderBy: { createdAt: "asc" } });
  return rows.map((row) => ({ id: row.id, name: row.name, canChange: canChange(ctx, row.createdById) }));
}

/**
 * For Blocks putting something on a layer (markups, photo pins): the layer
 * if it's one of this sheet's, or a 400. Null (Default) is always fine.
 */
export async function checkLayer(companyId: string, sheetId: string, layerId: string | null | undefined): Promise<string | null> {
  if (!layerId) return null;
  const layer = await db.planLayer.findFirst({ where: { id: layerId, sheetId, companyId, deletedAt: null }, select: { id: true } });
  if (!layer) throw badRequest("That layer isn't on this sheet any more");
  return layer.id;
}

const tidyName = (name: string) => {
  const tidy = name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!tidy) throw badRequest("Give the layer a name");
  if (tidy.toLowerCase() === "default") throw badRequest("Every sheet already has Default. Pick another name.");
  return tidy;
};

export async function addLayer(ctx: RequestContext, sheetId: string, name: string): Promise<LayerView> {
  const sheet = await sheetForOverlay(ctx, sheetId);
  const tidy = tidyName(name);
  const layer = await db.$transaction(async (tx) => {
    const taken = await tx.planLayer.count({ where: { sheetId: sheet.id, companyId: sheet.companyId, deletedAt: null, name: { equals: tidy, mode: "insensitive" } } });
    if (taken) throw badRequest(`This sheet already has a layer called ${tidy}`);
    const layer = await tx.planLayer.create({ data: { companyId: sheet.companyId, sheetId: sheet.id, name: tidy, createdById: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: sheet.companyId, projectId: sheet.projectId, entityType: "PlanLayer", entityId: layer.id, action: "added", diff: { name: tidy, sheet: sheet.number } });
    return layer;
  });
  return { id: layer.id, name: layer.name, canChange: true };
}

async function changeableLayer(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const layer = await db.planLayer.findFirst({ where: { id, companyId, deletedAt: null } });
  if (!layer) throw notFound("That layer isn't there any more");
  const sheet = await sheetForOverlay(ctx, layer.sheetId); // you can still see the sheet and the job
  if (!canChange(ctx, layer.createdById)) throw forbidden("Only the person who made the layer, or a Foreman or Owner, can change it");
  return { layer, sheet };
}

export async function renameLayer(ctx: RequestContext, id: string, name: string): Promise<LayerView> {
  const { layer, sheet } = await changeableLayer(ctx, id);
  const tidy = tidyName(name);
  const saved = await db.$transaction(async (tx) => {
    const taken = await tx.planLayer.count({ where: { sheetId: layer.sheetId, companyId: layer.companyId, deletedAt: null, id: { not: id }, name: { equals: tidy, mode: "insensitive" } } });
    if (taken) throw badRequest(`This sheet already has a layer called ${tidy}`);
    const saved = await tx.planLayer.update({ where: { id }, data: { name: tidy } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: layer.companyId, projectId: sheet.projectId, entityType: "PlanLayer", entityId: id, action: "updated", diff: { before: { name: layer.name }, after: { name: tidy } } });
    return saved;
  });
  return { id: saved.id, name: saved.name, canChange: true };
}

/** Gone; what was on it goes back on Default (markups and photos move it when they hear). */
export async function deleteLayer(ctx: RequestContext, id: string) {
  const { layer, sheet } = await changeableLayer(ctx, id);
  await db.$transaction(async (tx) => {
    await tx.planLayer.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: layer.companyId, projectId: sheet.projectId, entityType: "PlanLayer", entityId: id, action: "deleted", diff: { name: layer.name, sheet: sheet.number } });
  });
  const payload: LayerDeletedEvent = { layerId: id, sheetId: layer.sheetId, companyId: layer.companyId };
  await app().events.emit("plans.layerDeleted", payload, { emittedBy: MOD, companyId: layer.companyId, actorId: ctx.userId });
  return { id, deleted: true };
}
