// Markups block service (phase 4b): markups and measurements drawn over a
// plan sheet, and each revision's scale.
//
// Markups belong to the business that drew them. Everyone in the business
// sees them, except ones marked "Just me". They carry over to newer
// revisions of the sheet (geometry.showsOn); the phone works out which to
// show, so this returns every markup on the sheet.

import "server-only";
import { app, badRequest, conflict, forbidden, notFound, type RequestContext } from "@grid/core";
import { audit, db, type Prisma } from "@grid/db";
import { sheetForOverlay } from "@grid/block-plans";
import { metresPerUnitFromPoints, metresPerUnitFromRatio, type MarkupKind, type Point } from "./geometry";
import type { CreateMarkupInput, SetScaleInput, UpdateMarkupInput } from "./validation";

const MOD = "markups";

export interface MarkupView {
  id: string;
  versionId: string;
  kind: MarkupKind;
  points: Point[];
  color: string;
  size: number;
  text: string | null;
  visibility: "JUST_ME" | "COMPANY" | "SHARED";
  by: string;
  createdAt: Date;
  updatedAt: Date;
  /** You drew it, or you may change anyone's. */
  canChange: boolean;
  /** You drew it (only you can make it "Just me"). */
  mine: boolean;
}

export interface ScaleView {
  versionId: string;
  metresPerUnit: number;
  method: "RATIO" | "POINTS";
  ratio: number | null;
  knownMetres: number | null;
  setBy: string;
  setAt: Date;
}

/** Markups this person may see on a sheet (their own business's; "Just me" ones only if theirs). */
const visibleTo = (ctx: RequestContext, companyId: string) => ({
  deletedAt: null,
  OR: [{ companyId, visibility: { not: "JUST_ME" as const } }, { companyId, createdById: ctx.userId }],
});

const canChange = (ctx: RequestContext, createdById: string) => createdById === ctx.userId || ctx.permissions.has("markups.manage");

async function names(ids: string[]) {
  const users = await db.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
  return new Map(users.map((user) => [user.id, user.name]));
}

function view(ctx: RequestContext, markup: Prisma.PlanMarkupGetPayload<object>, who: Map<string, string>): MarkupView {
  return {
    id: markup.id,
    versionId: markup.versionId,
    kind: markup.kind,
    points: markup.points as Point[],
    color: markup.color,
    size: markup.size,
    text: markup.text,
    visibility: markup.visibility,
    by: who.get(markup.createdById) ?? "Someone",
    createdAt: markup.createdAt,
    updatedAt: markup.updatedAt,
    canChange: canChange(ctx, markup.createdById),
    mine: markup.createdById === ctx.userId,
  };
}

/** Every markup on a sheet you may see, oldest first (drawn in that order), and each revision's scale. */
export async function sheetMarkups(ctx: RequestContext, sheetId: string): Promise<{ markups: MarkupView[]; scales: ScaleView[] }> {
  const sheet = await sheetForOverlay(ctx, sheetId);
  const [markups, scales] = await Promise.all([
    db.planMarkup.findMany({ where: { sheetId, ...visibleTo(ctx, sheet.companyId) }, orderBy: { createdAt: "asc" }, take: 5000 }),
    db.planScale.findMany({ where: { sheetId, companyId: sheet.companyId } }),
  ]);
  const who = await names([...markups.map((markup) => markup.createdById), ...scales.map((scale) => scale.setById)]);
  return {
    markups: markups.map((markup) => view(ctx, markup, who)),
    scales: scales.map((scale) => ({
      versionId: scale.versionId,
      metresPerUnit: scale.metresPerUnit,
      method: scale.method,
      ratio: scale.ratio,
      knownMetres: scale.knownMetres,
      setBy: who.get(scale.setById) ?? "Someone",
      setAt: scale.setAt,
    })),
  };
}

/**
 * Saves a markup. The id comes from the device, so a retried save just
 * returns the first one.
 */
export async function createMarkup(ctx: RequestContext, input: CreateMarkupInput): Promise<MarkupView> {
  const sheet = await sheetForOverlay(ctx, input.sheetId);
  const existing = await db.planMarkup.findUnique({ where: { id: input.id } });
  if (existing) {
    if (existing.companyId !== sheet.companyId || existing.sheetId !== sheet.id) throw conflict("That markup id is already used");
    return view(ctx, existing, await names([existing.createdById]));
  }
  if (!sheet.versions.some((version) => version.id === input.versionId)) throw badRequest("That revision isn't part of this sheet");
  if (input.visibility === "SHARED") throw badRequest("Sharing markups with other businesses on the job comes later");

  const markup = await db.$transaction(async (tx) => {
    const markup = await tx.planMarkup.create({
      data: {
        id: input.id,
        companyId: sheet.companyId,
        projectId: sheet.projectId,
        sheetId: sheet.id,
        versionId: input.versionId,
        kind: input.kind,
        points: input.points,
        color: input.color,
        size: input.size,
        text: input.kind === "TEXT" ? (input.text ?? null) : null,
        visibility: input.visibility,
        createdById: ctx.userId,
      },
    });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId: sheet.companyId,
      projectId: sheet.projectId,
      entityType: "PlanMarkup",
      entityId: markup.id,
      action: "added",
      diff: { kind: input.kind, sheet: sheet.number, versionId: input.versionId },
    });
    return markup;
  });
  await app().events.emit("markups.added", { projectId: sheet.projectId, sheetId: sheet.id, markupId: markup.id, kind: markup.kind }, { emittedBy: MOD, companyId: sheet.companyId, actorId: ctx.userId });
  return view(ctx, markup, await names([ctx.userId]));
}

/** A markup you may change (yours, or anyone's with markups.manage). `deleted`: find it in the bin too. */
async function changeable(ctx: RequestContext, id: string, options: { deleted?: boolean } = {}) {
  const markup = await db.planMarkup.findUnique({ where: { id } });
  if (!markup || markup.companyId !== ctx.companyId || (!options.deleted && markup.deletedAt)) throw notFound("Markup not found");
  if (markup.visibility === "JUST_ME" && markup.createdById !== ctx.userId) throw notFound("Markup not found");
  // Checks you can still see the sheet (and the job).
  await sheetForOverlay(ctx, markup.sheetId);
  if (!canChange(ctx, markup.createdById)) throw forbidden("Only the person who drew it, or a Foreman or Owner, can change it");
  return markup;
}

export async function updateMarkup(ctx: RequestContext, id: string, input: UpdateMarkupInput): Promise<MarkupView> {
  const before = await changeable(ctx, id);
  if (input.visibility === "SHARED") throw badRequest("Sharing markups with other businesses on the job comes later");
  if (input.visibility === "JUST_ME" && before.createdById !== ctx.userId) throw badRequest("Only the person who drew it can make it theirs alone");
  if (input.text !== undefined && before.kind !== "TEXT") throw badRequest("Only text markups have text");
  const markup = await db.$transaction(async (tx) => {
    const markup = await tx.planMarkup.update({ where: { id }, data: { ...input, updatedById: ctx.userId } });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId: before.companyId,
      projectId: before.projectId,
      entityType: "PlanMarkup",
      entityId: id,
      action: "updated",
      diff: { before: { color: before.color, size: before.size, text: before.text, visibility: before.visibility, moved: input.points ? true : undefined } } as Prisma.InputJsonValue,
    });
    return markup;
  });
  return view(ctx, markup, await names([markup.createdById]));
}

export async function deleteMarkup(ctx: RequestContext, id: string) {
  const markup = await changeable(ctx, id);
  await db.$transaction(async (tx) => {
    await tx.planMarkup.update({ where: { id }, data: { deletedAt: new Date(), deletedById: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: markup.companyId, projectId: markup.projectId, entityType: "PlanMarkup", entityId: id, action: "deleted", diff: { kind: markup.kind } });
  });
  return { id, deleted: true };
}

/** Undo a delete. */
export async function restoreMarkup(ctx: RequestContext, id: string): Promise<MarkupView> {
  const before = await changeable(ctx, id, { deleted: true });
  if (!before.deletedAt) return view(ctx, before, await names([before.createdById]));
  const markup = await db.$transaction(async (tx) => {
    const markup = await tx.planMarkup.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: markup.companyId, projectId: markup.projectId, entityType: "PlanMarkup", entityId: id, action: "restored" });
    return markup;
  });
  return view(ctx, markup, await names([markup.createdById]));
}

// ---------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------

/** Sets how big a revision really is, from the drawing's scale or a known length. */
export async function setScale(ctx: RequestContext, sheetId: string, versionId: string, input: SetScaleInput) {
  const sheet = await sheetForOverlay(ctx, sheetId);
  const version = sheet.versions.find((version) => version.id === versionId);
  if (!version) throw notFound("Revision not found");
  let metresPerUnit: number;
  if (input.method === "RATIO") {
    if (!version.pageWidthPt) throw badRequest("This sheet is a picture, not a PDF, so Grid doesn't know its paper size. Measure something you know instead.");
    metresPerUnit = metresPerUnitFromRatio(version.pageWidthPt, input.ratio);
  } else {
    try {
      metresPerUnit = metresPerUnitFromPoints(input.points[0], input.points[1], input.knownMetres);
    } catch {
      throw badRequest("Pick two different points");
    }
  }
  const data = {
    metresPerUnit,
    method: input.method,
    ratio: input.method === "RATIO" ? input.ratio : null,
    points: input.method === "POINTS" ? input.points : undefined,
    knownMetres: input.method === "POINTS" ? input.knownMetres : null,
    setById: ctx.userId,
  };
  await db.$transaction(async (tx) => {
    const before = await tx.planScale.findUnique({ where: { versionId } });
    await tx.planScale.upsert({ where: { versionId }, create: { versionId, companyId: sheet.companyId, sheetId, ...data }, update: data });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId: sheet.companyId,
      projectId: sheet.projectId,
      entityType: "PlanScale",
      entityId: versionId,
      action: before ? "updated" : "added",
      diff: { sheet: sheet.number, revision: version.revision, method: input.method, ratio: data.ratio, knownMetres: data.knownMetres, before: before ? { metresPerUnit: before.metresPerUnit } : null },
    });
  });
  return { versionId, metresPerUnit };
}

export async function clearScale(ctx: RequestContext, sheetId: string, versionId: string) {
  const sheet = await sheetForOverlay(ctx, sheetId);
  if (!sheet.versions.some((version) => version.id === versionId)) throw notFound("Revision not found");
  await db.$transaction(async (tx) => {
    const before = await tx.planScale.findUnique({ where: { versionId } });
    if (!before) return;
    await tx.planScale.delete({ where: { versionId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: sheet.companyId, projectId: sheet.projectId, entityType: "PlanScale", entityId: versionId, action: "deleted", diff: { metresPerUnit: before.metresPerUnit } });
  });
  return { versionId, cleared: true };
}
