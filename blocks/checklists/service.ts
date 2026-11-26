// A job's checklist (docs/stage-2-projects.md "Job checklist"). Everything
// is the business's own list for the job (ctx.companyId); seeing it needs
// the job, ticking needs checklists.items.tick, changing the list needs
// checklists.items.manage. An archived job's list is kept as it was.

import { badRequest, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db } from "@grid/db";
import { getProject } from "@grid/block-projects";
import { itemsFromText } from "./lines";

const MOD = "checklists";

export interface ChecklistItemJson {
  id: string;
  text: string;
  position: number;
  /** When it was ticked off, or null while it's still to do. */
  doneAt: string | null;
  doneBy: { id: string | null; name: string } | null;
}

type ItemRecord = { id: string; text: string; position: number; doneAt: Date | null; doneById: string | null; doneByName: string | null };

const toJson = (item: ItemRecord): ChecklistItemJson => ({
  id: item.id,
  text: item.text,
  position: item.position,
  doneAt: item.doneAt?.toISOString() ?? null,
  doneBy: item.doneAt ? { id: item.doneById, name: item.doneByName ?? "Someone" } : null,
});

const itemSelect = { id: true, text: true, position: true, doneAt: true, doneById: true, doneByName: true } as const;

/** The job (checks you can see it); for changes, it mustn't be archived. */
async function jobFor(ctx: RequestContext, projectId: string, forChange: boolean) {
  const job = await getProject(ctx, projectId);
  if (forChange && job.archivedAt) throw badRequest("This job is archived: restore it to change its checklist");
  return job;
}

/** One of this business's items, and its job (checked). */
async function itemFor(ctx: RequestContext, itemId: string) {
  const companyId = requireCompany(ctx);
  const item = /^[0-9a-f-]{36}$/.test(itemId) ? await db.checklistItem.findFirst({ where: { id: itemId, companyId }, select: { ...itemSelect, projectId: true } }) : null;
  if (!item) throw notFound("That item isn't on the list any more");
  await jobFor(ctx, item.projectId, true);
  return item;
}

export async function listItems(ctx: RequestContext, projectId: string): Promise<ChecklistItemJson[]> {
  const companyId = requireCompany(ctx);
  await jobFor(ctx, projectId, false);
  const items = await db.checklistItem.findMany({ where: { companyId, projectId }, select: itemSelect, orderBy: { position: "asc" } });
  return items.map(toJson);
}

/** Adds an item, or several (one per line). They go at the end of the list. */
export async function addItems(ctx: RequestContext, projectId: string, text: string): Promise<ChecklistItemJson[]> {
  const companyId = requireCompany(ctx);
  await jobFor(ctx, projectId, true);
  const texts = itemsFromText(text);
  if (!texts.length) throw badRequest("Type something to add");
  return db.$transaction(async (tx) => {
    const last = await tx.checklistItem.findFirst({ where: { companyId, projectId }, orderBy: { position: "desc" }, select: { position: true } });
    let position = (last?.position ?? 0) + 1;
    const added: ChecklistItemJson[] = [];
    for (const itemText of texts) {
      const item = await tx.checklistItem.create({ data: { companyId, projectId, text: itemText, position: position++, createdById: ctx.userId }, select: itemSelect });
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "ChecklistItem", entityId: item.id, action: "added", diff: { text: itemText, projectId } });
      added.push(toJson(item));
    }
    return added;
  });
}

export async function renameItem(ctx: RequestContext, itemId: string, text: string): Promise<ChecklistItemJson> {
  const companyId = requireCompany(ctx);
  const before = await itemFor(ctx, itemId);
  return db.$transaction(async (tx) => {
    const item = await tx.checklistItem.update({ where: { id: itemId }, data: { text }, select: itemSelect });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "ChecklistItem", entityId: itemId, action: "renamed", diff: { before: before.text, after: text, projectId: before.projectId } });
    return toJson(item);
  });
}

/** Ticks it off (recording who and when), or puts it back to do. */
export async function tickItem(ctx: RequestContext, itemId: string, done: boolean): Promise<ChecklistItemJson> {
  const companyId = requireCompany(ctx);
  const before = await itemFor(ctx, itemId);
  // Already as asked (two people tapped at once): keep the first tick's who and when.
  if (!!before.doneAt === done) return toJson(before);
  const person = done ? await db.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }) : null;
  return db.$transaction(async (tx) => {
    const item = await tx.checklistItem.update({
      where: { id: itemId },
      data: done ? { doneAt: new Date(), doneById: ctx.userId, doneByName: person?.name ?? null } : { doneAt: null, doneById: null, doneByName: null },
      select: itemSelect,
    });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "ChecklistItem",
      entityId: itemId,
      action: done ? "ticked" : "unticked",
      diff: { text: item.text, projectId: before.projectId, ...(done ? {} : { wasDoneBy: before.doneByName, wasDoneAt: before.doneAt }) },
    });
    return toJson(item);
  });
}

export async function removeItem(ctx: RequestContext, itemId: string): Promise<{ removed: true }> {
  const companyId = requireCompany(ctx);
  const before = await itemFor(ctx, itemId);
  await db.$transaction(async (tx) => {
    await tx.checklistItem.delete({ where: { id: itemId } });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "ChecklistItem",
      entityId: itemId,
      action: "removed",
      diff: { text: before.text, projectId: before.projectId, wasDone: !!before.doneAt },
    });
  });
  return { removed: true };
}
