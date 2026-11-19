// Trade icons on a job (phase 4c part 1, docs/roadmap.md "Phase 4c"):
// the numbered versions of each icon (DGPO 1, DGPO 2…, set per job only),
// how many of each are placed (per sheet, so the screens can add up a
// level or the whole job), and switching placed icons to another number.

import "server-only";
import { badRequest, conflict, forbidden, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db } from "@grid/db";
import { canSeeJob } from "@grid/block-projects";
import { iconByKey } from "./icons";

const MOD = "markups";

async function jobOrThrow(ctx: RequestContext, projectId: string) {
  if (!(await canSeeJob(ctx, projectId))) throw notFound("Job not found");
}

export interface IconVersionView {
  id: string;
  iconKey: string;
  number: number;
  name: string | null;
  priceItemId: string | null;
}

export interface IconCount {
  sheetId: string;
  sheetNumber: string;
  sheetTitle: string;
  buildingId: string | null;
  levelId: string | null;
  iconKey: string;
  /** 1 for icons placed before numbers were added. */
  number: number;
  count: number;
}

const versionView = (row: { id: string; iconKey: string; number: number; name: string | null; priceItemId: string | null }): IconVersionView => ({
  id: row.id,
  iconKey: row.iconKey,
  number: row.number,
  name: row.name,
  priceItemId: row.priceItemId,
});

/** A job's icon numbers, and how many of each icon are placed on each of its sheets. */
export async function jobIcons(ctx: RequestContext, projectId: string): Promise<{ versions: IconVersionView[]; counts: IconCount[] }> {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  const [versions, sheets] = await Promise.all([
    db.jobIconVersion.findMany({ where: { companyId, projectId }, orderBy: [{ iconKey: "asc" }, { number: "asc" }] }),
    db.planSheet.findMany({ where: { companyId, projectId, deletedAt: null }, select: { id: true, number: true, title: true, buildingId: true, levelId: true } }),
  ]);
  const groups = await db.planMarkup.groupBy({
    by: ["sheetId", "iconKey", "iconNumber"],
    where: {
      companyId,
      projectId,
      kind: "ICON",
      deletedAt: null,
      sheetId: { in: sheets.map((sheet) => sheet.id) },
      OR: [{ visibility: { not: "JUST_ME" } }, { createdById: ctx.userId }],
    },
    _count: { _all: true },
  });
  const bySheet = new Map(sheets.map((sheet) => [sheet.id, sheet]));
  const counts = new Map<string, IconCount>();
  for (const group of groups) {
    const sheet = bySheet.get(group.sheetId);
    if (!sheet || !group.iconKey) continue;
    const number = group.iconNumber ?? 1;
    const key = `${sheet.id}|${group.iconKey}|${number}`;
    const entry = counts.get(key) ?? { sheetId: sheet.id, sheetNumber: sheet.number, sheetTitle: sheet.title, buildingId: sheet.buildingId, levelId: sheet.levelId, iconKey: group.iconKey, number, count: 0 };
    entry.count += group._count._all;
    counts.set(key, entry);
  }
  return { versions: versions.map(versionView), counts: [...counts.values()] };
}

/**
 * "+" on the number chips: the icon's next number on this job. The first
 * time, that makes 1 (what's already placed) and 2.
 */
export async function addIconVersion(ctx: RequestContext, projectId: string, input: { iconKey: string; name?: string | null }) {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  const icon = iconByKey(input.iconKey);
  if (!icon) throw badRequest("Pick an icon");
  await db.$transaction(async (tx) => {
    // One at a time per job and icon, so two people tapping + don't clash.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`markups:icon-version:${projectId}:${input.iconKey}`}))`;
    const existing = await tx.jobIconVersion.findMany({ where: { companyId, projectId, iconKey: input.iconKey }, select: { number: true } });
    const next = existing.length ? Math.max(...existing.map((row) => row.number)) + 1 : 2;
    if (next > 99) throw conflict("That's as many numbers as one icon can have");
    if (!existing.length) await tx.jobIconVersion.create({ data: { companyId, projectId, iconKey: input.iconKey, number: 1, createdById: ctx.userId } });
    const created = await tx.jobIconVersion.create({ data: { companyId, projectId, iconKey: input.iconKey, number: next, name: input.name || null, createdById: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId, entityType: "JobIconVersion", entityId: created.id, action: "added", diff: { icon: icon.name, number: next, name: input.name || undefined } });
  });
  return jobIcons(ctx, projectId);
}

async function ownVersion(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const version = await db.jobIconVersion.findFirst({ where: { id, companyId } });
  if (!version) throw notFound("That number isn't on this job");
  await jobOrThrow(ctx, version.projectId);
  return version;
}

/** A number's short name, and (from the quote's Take-off, part 2) its price book item. */
export async function updateIconVersion(ctx: RequestContext, id: string, input: { name?: string | null; priceItemId?: string | null }) {
  const version = await ownVersion(ctx, id);
  await db.$transaction(async (tx) => {
    await tx.jobIconVersion.update({ where: { id }, data: { ...(input.name !== undefined ? { name: input.name || null } : {}), ...(input.priceItemId !== undefined ? { priceItemId: input.priceItemId } : {}) } });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId: version.companyId,
      projectId: version.projectId,
      entityType: "JobIconVersion",
      entityId: id,
      action: "updated",
      diff: { icon: iconByKey(version.iconKey)?.name, number: version.number, before: { name: version.name, priceItemId: version.priceItemId }, after: input },
    });
  });
  return jobIcons(ctx, version.projectId);
}

/** Removes a number, only while no placed icon uses it. Removing down to one number leaves the icon unnumbered. */
export async function deleteIconVersion(ctx: RequestContext, id: string) {
  const version = await ownVersion(ctx, id);
  const used = await db.planMarkup.count({
    where: { companyId: version.companyId, projectId: version.projectId, kind: "ICON", iconKey: version.iconKey, deletedAt: null, ...(version.number === 1 ? { OR: [{ iconNumber: 1 }, { iconNumber: null }] } : { iconNumber: version.number }) },
  });
  if (used) throw conflict(`${used} placed icon${used === 1 ? " uses" : "s use"} number ${version.number}. Switch ${used === 1 ? "it" : "them"} to another number first.`);
  await db.$transaction(async (tx) => {
    await tx.jobIconVersion.delete({ where: { id } });
    // One number left: the icon goes back to unnumbered (its icons were all that number).
    const left = await tx.jobIconVersion.findMany({ where: { companyId: version.companyId, projectId: version.projectId, iconKey: version.iconKey } });
    if (left.length === 1) {
      await tx.jobIconVersion.delete({ where: { id: left[0]!.id } });
      await tx.planMarkup.updateMany({ where: { companyId: version.companyId, projectId: version.projectId, kind: "ICON", iconKey: version.iconKey }, data: { iconNumber: null } });
    }
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId: version.companyId, projectId: version.projectId, entityType: "JobIconVersion", entityId: id, action: "deleted", diff: { icon: iconByKey(version.iconKey)?.name, number: version.number } });
  });
  return jobIcons(ctx, version.projectId);
}

/** Switches placed icons (one or many, same icon) to another number. */
export async function renumberIcons(ctx: RequestContext, input: { ids: string[]; iconNumber: number | null }) {
  const companyId = requireCompany(ctx);
  const markups = await db.planMarkup.findMany({ where: { id: { in: input.ids }, companyId, kind: "ICON", deletedAt: null } });
  if (markups.length !== new Set(input.ids).size) throw notFound("Some of those icons aren't there any more");
  const projectIds = new Set(markups.map((markup) => markup.projectId));
  const keys = new Set(markups.map((markup) => markup.iconKey));
  if (projectIds.size !== 1 || keys.size !== 1) throw badRequest("Pick icons of one kind, on one job");
  const projectId = markups[0]!.projectId;
  const iconKey = markups[0]!.iconKey!;
  await jobOrThrow(ctx, projectId);
  const manage = ctx.permissions.has("markups.manage");
  if (!manage && markups.some((markup) => markup.createdById !== ctx.userId)) throw forbidden("Only the person who placed them, or a Foreman or Owner, can change them");
  if (markups.some((markup) => markup.visibility === "JUST_ME" && markup.createdById !== ctx.userId)) throw notFound("Some of those icons aren't there any more");
  if (input.iconNumber !== null && input.iconNumber > 1) {
    const exists = await db.jobIconVersion.count({ where: { companyId, projectId, iconKey, number: input.iconNumber } });
    if (!exists) throw badRequest(`There's no number ${input.iconNumber} for that icon on this job yet`);
  }
  await db.$transaction(async (tx) => {
    await tx.planMarkup.updateMany({ where: { id: { in: markups.map((markup) => markup.id) } }, data: { iconNumber: input.iconNumber, updatedById: ctx.userId } });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      projectId,
      entityType: "PlanMarkup",
      entityId: markups[0]!.id,
      action: "renumbered",
      diff: { icon: iconByKey(iconKey)?.name, count: markups.length, to: input.iconNumber },
    });
  });
  return { ids: markups.map((markup) => markup.id), iconNumber: input.iconNumber };
}
