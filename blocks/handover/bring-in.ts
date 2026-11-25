// Bring in from plans and the accepted quote (docs/materials-block.md §2).
// The counts come from other Blocks through their `jobMaterials` hook
// (markups: icons on the plans; quotes: accepted quotes), so Handover works
// with either of them off. The rules are in bring-in-plan.ts.

import "server-only";
import { app, badRequest, requireCompany, type JobMaterialRow, type RequestContext } from "@grid/core";
import { audit, db } from "@grid/db";
import { getProject } from "@grid/block-projects";
import { materialsById, type MaterialRow } from "@grid/block-materials";
import { addUp, choiceKeys, planBringIn, type BringSource, type CountedRow, type IncomingLine } from "./bring-in-plan";

const MOD = "handover";

/** The blocks this business has on that can count materials for a job. */
function providers(ctx: RequestContext) {
  return app().registry.blocks.filter((block) => block.required || ctx.enabledBlocks.has(block.id));
}

/** Which sources Bring in can use for this business: plans (Markups on), accepted quotes (Quotes on). */
export async function bringInSources(ctx: RequestContext): Promise<BringSource[]> {
  const ids = new Set(providers(ctx).filter((block) => block.jobMaterials).map((block) => block.id));
  return [...(ids.has("markups") ? (["PLANS"] as const) : []), ...(ids.has("quotes") ? (["QUOTE"] as const) : [])];
}

async function counted(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  const rows: JobMaterialRow[] = [];
  const blocks = providers(ctx);
  for (const block of blocks) {
    if (!block.jobMaterials) continue;
    try {
      rows.push(...(await (await block.jobMaterials())({ companyId, projectId })));
    } catch (error) {
      console.error(`[handover] ${block.id} couldn't count materials for job ${projectId}`, error);
    }
  }
  // Rows that only know their price list item: ask for its material.
  const itemIds = rows.flatMap((row) => (!row.materialId && row.priceItemId ? [row.priceItemId] : []));
  const fromItems: Record<string, string> = {};
  if (itemIds.length) {
    for (const block of blocks) {
      if (!block.priceItemMaterials) continue;
      Object.assign(fromItems, await (await block.priceItemMaterials())(companyId, itemIds));
    }
  }
  const resolved: CountedRow[] = rows.map((row) => ({
    source: row.source,
    label: row.label,
    levelId: row.levelId,
    groupId: row.groupId,
    materialId: row.materialId ?? (row.priceItemId ? (fromItems[row.priceItemId] ?? null) : null),
    qty: row.qty,
    fromPlans: row.fromPlans,
  }));
  return resolved;
}

const materialView = (material: MaterialRow | undefined) =>
  material ? { name: material.name, brand: material.brand, finish: material.finish, size: material.size, photoFileId: material.photoFileId, swatch: material.swatch } : { name: "Removed material", brand: null, finish: null, size: null, photoFileId: null, swatch: null };

async function work(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  const job = await getProject(ctx, projectId);
  const sources = await bringInSources(ctx);
  const rows = await counted(ctx, projectId);
  const multiBuilding = new Set(job.areas.map((area) => area.buildingId)).size > 1;
  const levelName = (levelId: string) => {
    const area = job.areas.find((entry) => entry.levelId === levelId);
    if (!area?.levelName) return null;
    return multiBuilding ? `${area.buildingName} ${area.levelName}` : area.levelName;
  };
  const { lines: all, unlinked } = addUp(rows, { plansBroughtIn: sources.includes("PLANS"), levelName });
  const items = await db.handoverItem.findMany({ where: { companyId, projectId }, orderBy: { createdAt: "asc" } });
  const materials = await materialsById(ctx, [...all.map((line) => line.materialId), ...items.map((item) => item.materialId)]);
  // A material removed from Materials isn't added again (lines already on the list stay).
  const incoming = all.filter((line) => materials.get(line.materialId) && !materials.get(line.materialId)!.removed);
  const existing = items.map((item) => ({ id: item.id, source: item.source, sourceRef: item.sourceRef, materialId: item.materialId, room: item.room, qty: item.qty === null ? null : Number(item.qty), editedByHand: item.editedByHand }));
  const plan = planBringIn(incoming, existing, sources);
  return { companyId, job, sources, plan, unlinked, materials };
}

/** What Bring in would change, for the sheet to show with a tick each. */
export async function bringInPreview(ctx: RequestContext, projectId: string) {
  const { sources, plan, unlinked, materials } = await work(ctx, projectId);
  const view = (id: string) => materialView(materials.get(id));
  return {
    sources,
    add: plan.add.map((line) => ({ choice: `add:${line.key}`, source: line.source, material: view(line.materialId), room: line.room, qty: line.qty, from: line.from })),
    update: plan.update.map(({ line, incoming }) => ({ choice: `update:${line.id}`, source: incoming.source, material: view(line.materialId), room: line.room, was: line.qty, now: incoming.qty, from: incoming.from })),
    remove: plan.remove.map((line) => ({ choice: `remove:${line.id}`, source: line.source, material: view(line.materialId), room: line.room, was: line.qty })),
    kept: plan.kept.map(({ line, incoming }) => ({ id: line.id, source: line.source, material: view(line.materialId), room: line.room, was: line.qty, now: incoming?.qty ?? 0 })),
    unlinked,
  };
}

const diffOf = (material: MaterialRow | undefined, line: { room: string | null; qty: number | null }, source: BringSource) => ({
  material: material?.name,
  finish: material?.finish,
  room: line.room ?? "General",
  qty: line.qty,
  from: source === "PLANS" ? "plans" : "quote",
});

/**
 * Makes the ticked changes. Worked out again first, so a change the plans
 * or quote no longer call for (or a line changed by hand since) is skipped.
 */
export async function bringIn(ctx: RequestContext, projectId: string, choices: string[]) {
  const { companyId, plan, materials } = await work(ctx, projectId);
  const offered = new Set(choiceKeys(plan));
  const picked = new Set(choices.filter((choice) => offered.has(choice)));
  if (!picked.size) throw badRequest("Nothing to bring in. The plans or quote may have changed: have another look.");
  const add = plan.add.filter((line) => picked.has(`add:${line.key}`));
  const update = plan.update.filter(({ line }) => picked.has(`update:${line.id}`));
  const remove = plan.remove.filter((line) => picked.has(`remove:${line.id}`));
  await db.$transaction(async (tx) => {
    const last = await tx.handoverItem.aggregate({ where: { projectId }, _max: { sort: true } });
    let sort = last._max.sort ?? 0;
    for (const line of add as IncomingLine[]) {
      const material = materials.get(line.materialId)!;
      const item = await tx.handoverItem.create({
        data: { companyId, projectId, materialId: line.materialId, trade: material.trade, room: line.room, qty: line.qty, source: line.source, sourceRef: line.sourceRef, sort: ++sort },
      });
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId, entityType: "HandoverItem", entityId: item.id, action: "brought_in", diff: diffOf(material, line, line.source) });
    }
    for (const { line, incoming } of update) {
      await tx.handoverItem.update({ where: { id: line.id }, data: { qty: incoming.qty } });
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId, entityType: "HandoverItem", entityId: line.id, action: "updated", diff: { ...diffOf(materials.get(line.materialId), { room: line.room, qty: incoming.qty }, incoming.source), before: line.qty } });
    }
    for (const line of remove) {
      await tx.handoverItem.delete({ where: { id: line.id } });
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId, entityType: "HandoverItem", entityId: line.id, action: "deleted", diff: diffOf(materials.get(line.materialId), line, line.source as BringSource) });
    }
  });
  return { added: add.length, updated: update.length, removed: remove.length };
}
