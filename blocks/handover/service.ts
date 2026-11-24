// A job's handover list (docs/materials-block.md §2): what's installed, by
// trade and room, with the job's switches (quantities, room per page,
// cover) and the business's settings (title, printed trade names, hidden
// columns). The PDF is in pdf.ts, the client's link in share.ts.

import "server-only";
import { badRequest, notFound, requireCompany, type RequestContext } from "@grid/core";
import { attachFile, audit, db, purgeStoredFile, type Prisma, type Tx } from "@grid/db";
import { canSeeJob, getProject } from "@grid/block-projects";
import { materialsById, requireMaterial, tradeName, MATERIAL_TRADES, type MaterialRow } from "@grid/block-materials";
import { cleanRoom, groupSchedule, orderedRooms, roomKey, type TradeGroup } from "./schedule";
import type { CompanySettingsInput, JobSettingsInput, LineChange, LineInput } from "./validation";

const MOD = "handover";
export const DEFAULT_TITLE = "Fixtures & Finishes Schedule";
export const TRADE_ORDER = MATERIAL_TRADES.map((trade) => trade.id);

export interface HandoverLine {
  id: string;
  materialId: string;
  trade: string;
  room: string | null;
  qty: number | null;
  note: string | null;
  source: "MANUAL" | "PLANS" | "QUOTE";
  editedByHand: boolean;
  createdAt: Date;
  /** What it sorts by in its room. */
  sortName: string;
  material: MaterialRow;
}

export interface JobSettingsView {
  showQty: boolean;
  roomPerPage: boolean;
  cover: boolean;
  /** This job's own title, or null for the business's. */
  title: string | null;
  coverFileId: string | null;
  roomOrder: string[];
}

export interface CompanySettingsView {
  title: string;
  /** Printed name per trade id (only the changed ones). */
  tradeNames: Record<string, string>;
  /** Hidden optional columns per trade id. */
  tradeColumns: Record<string, string[]>;
}

export const DEFAULT_JOB_SETTINGS: JobSettingsView = { showQty: true, roomPerPage: false, cover: true, title: null, coverFileId: null, roomOrder: [] };

const asRecord = <T,>(value: Prisma.JsonValue | undefined, check: (entry: unknown) => entry is T): Record<string, T> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, T> = {};
  for (const [key, entry] of Object.entries(value)) if (check(entry)) out[key] = entry;
  return out;
};
const isText = (entry: unknown): entry is string => typeof entry === "string" && entry.trim() !== "";
const isTextList = (entry: unknown): entry is string[] => Array.isArray(entry) && entry.every((item) => typeof item === "string");

export async function companySettingsFor(companyId: string): Promise<CompanySettingsView> {
  const row = await db.handoverCompanySettings.findUnique({ where: { companyId } });
  return {
    title: row?.title || DEFAULT_TITLE,
    tradeNames: asRecord(row?.tradeNames, isText),
    tradeColumns: asRecord(row?.tradeColumns, isTextList),
  };
}

export async function jobSettingsFor(projectId: string): Promise<JobSettingsView> {
  const row = await db.handoverSettings.findUnique({ where: { projectId } });
  if (!row) return { ...DEFAULT_JOB_SETTINGS };
  return { showQty: row.showQty, roomPerPage: row.roomPerPage, cover: row.cover, title: row.title, coverFileId: row.coverFileId, roomOrder: row.roomOrder };
}

/** A trade as it prints: the business's own name for it, or the trade's. */
export const printedTrade = (settings: CompanySettingsView, trade: string) => settings.tradeNames[trade]?.trim() || tradeName(trade);

/** What a line sorts by in its room: the item type, then the name. */
export const sortNameOf = (material: Pick<MaterialRow, "itemType" | "name">) => [material.itemType, material.name].filter(Boolean).join(" ");

type ItemRecord = Awaited<ReturnType<typeof db.handoverItem.findMany>>[number];

export function toLine(item: ItemRecord, material: MaterialRow): HandoverLine {
  return {
    id: item.id,
    materialId: item.materialId,
    trade: item.trade,
    room: item.room,
    qty: item.qty === null ? null : Number(item.qty),
    note: item.note,
    source: item.source,
    editedByHand: item.editedByHand,
    createdAt: item.createdAt,
    sortName: sortNameOf(material),
    material,
  };
}

async function jobOrThrow(ctx: RequestContext, projectId: string) {
  if (!(await canSeeJob(ctx, projectId))) throw notFound("Job not found");
}

async function ownLine(tx: Tx, companyId: string, id: string) {
  const item = await tx.handoverItem.findFirst({ where: { id, companyId } });
  if (!item) throw notFound("That line isn't on the list any more");
  return item;
}

export interface HandoverView {
  job: { id: string; name: string; siteName: string; address: string; clientId: string | null; clientName: string | null; archived: boolean };
  settings: JobSettingsView;
  company: CompanySettingsView;
  lines: HandoverLine[];
  /** The job's rooms in print order (no General). */
  rooms: string[];
  groups: TradeGroup<HandoverLine>[];
}

/** The job's list, grouped, with its settings. */
export async function handoverFor(ctx: RequestContext, projectId: string): Promise<HandoverView> {
  const companyId = requireCompany(ctx);
  const job = await getProject(ctx, projectId);
  const [items, settings, company] = await Promise.all([
    db.handoverItem.findMany({ where: { companyId, projectId }, orderBy: [{ createdAt: "asc" }] }),
    jobSettingsFor(projectId),
    companySettingsFor(companyId),
  ]);
  const materials = await materialsById(ctx, items.map((item) => item.materialId));
  const lines = items.flatMap((item) => {
    const material = materials.get(item.materialId);
    return material ? [toLine(item, material)] : [];
  });
  return {
    job: { id: job.id, name: job.name, siteName: job.siteName, address: job.site.address, clientId: job.clientId, clientName: job.clientName, archived: !!job.archivedAt },
    settings,
    company,
    lines,
    rooms: orderedRooms(lines, settings.roomOrder),
    groups: groupSchedule(lines, { tradeOrder: TRADE_ORDER, roomOrder: settings.roomOrder }),
  };
}

/** How many lines a job has (the job page's Handover card). */
export async function lineCount(ctx: RequestContext, projectId: string) {
  return db.handoverItem.count({ where: { companyId: requireCompany(ctx), projectId } });
}

const lineDiff = (line: { room: string | null; qty: number | null; note: string | null }, material: MaterialRow) => ({ material: material.name, finish: material.finish, room: line.room ?? "General", qty: line.qty, note: line.note });

export async function addLine(ctx: RequestContext, projectId: string, input: LineInput): Promise<HandoverLine> {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  const material = await requireMaterial(ctx, input.materialId);
  if (material.removed) throw badRequest("That material was removed from Materials");
  const room = cleanRoom(input.room);
  const line = await db.$transaction(async (tx) => {
    const last = await tx.handoverItem.aggregate({ where: { projectId }, _max: { sort: true } });
    const item = await tx.handoverItem.create({
      data: { companyId, projectId, materialId: material.id, trade: material.trade, room, qty: input.qty, note: input.note, sort: (last._max.sort ?? 0) + 1 },
    });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId, entityType: "HandoverItem", entityId: item.id, action: "created", diff: lineDiff({ room, qty: input.qty, note: input.note }, material) });
    return toLine(item, material);
  });
  return line;
}

/**
 * Changes a line: its room, quantity, note, or its material (swapping the
 * finish for another in the family). A line brought in from plans or a
 * quote is marked as changed by hand, so bringing in again leaves it alone.
 */
export async function updateLine(ctx: RequestContext, id: string, input: LineChange): Promise<HandoverLine> {
  const companyId = requireCompany(ctx);
  const current = await ownLine(db, companyId, id);
  await jobOrThrow(ctx, current.projectId);
  const material = await requireMaterial(ctx, input.materialId ?? current.materialId);
  if (input.materialId && input.materialId !== current.materialId && material.removed) throw badRequest("That material was removed from Materials");
  const data: Prisma.HandoverItemUpdateInput = {};
  if (input.room !== undefined) data.room = cleanRoom(input.room);
  if (input.qty !== undefined) data.qty = input.qty;
  if (input.note !== undefined) data.note = input.note;
  if (input.materialId && input.materialId !== current.materialId) {
    data.materialId = material.id;
    data.trade = material.trade;
  }
  if (current.source !== "MANUAL") data.editedByHand = true;
  const line = await db.$transaction(async (tx) => {
    const item = await tx.handoverItem.update({ where: { id }, data });
    const next = toLine(item, material);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId: item.projectId, entityType: "HandoverItem", entityId: id, action: "updated", diff: lineDiff(next, material) });
    return next;
  });
  return line;
}

export async function deleteLine(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const current = await ownLine(db, companyId, id);
  await jobOrThrow(ctx, current.projectId);
  const material = await requireMaterial(ctx, current.materialId);
  await db.$transaction(async (tx) => {
    await tx.handoverItem.delete({ where: { id } });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      projectId: current.projectId,
      entityType: "HandoverItem",
      entityId: id,
      action: "deleted",
      diff: lineDiff({ room: current.room, qty: current.qty === null ? null : Number(current.qty), note: current.note }, material),
    });
  });
  return { id, deleted: true };
}

/** Renames a room on every line in it (blank moves them to General), and in the room order. */
export async function renameRoom(ctx: RequestContext, projectId: string, input: { from: string; to: string | null }) {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  const from = roomKey(input.from);
  const to = cleanRoom(input.to);
  if (!from) throw badRequest("Pick a room to rename");
  const items = await db.handoverItem.findMany({ where: { companyId, projectId }, select: { id: true, room: true, source: true } });
  const ids = items.filter((item) => roomKey(item.room) === from).map((item) => item.id);
  const settings = await jobSettingsFor(projectId);
  const roomOrder = [...new Set(settings.roomOrder.map((room) => (roomKey(room) === from ? to : room)).filter((room): room is string => !!room))];
  await db.$transaction(async (tx) => {
    await tx.handoverItem.updateMany({ where: { id: { in: ids } }, data: { room: to } });
    await tx.handoverItem.updateMany({ where: { id: { in: ids }, source: { not: "MANUAL" } }, data: { editedByHand: true } });
    await tx.handoverSettings.upsert({ where: { projectId }, create: { projectId, companyId, roomOrder }, update: { roomOrder } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId, entityType: "HandoverSettings", entityId: projectId, action: "room_renamed", diff: { from: input.from, to: to ?? "General", lines: ids.length } });
  });
  return { lines: ids.length };
}

export async function saveJobSettings(ctx: RequestContext, projectId: string, input: JobSettingsInput): Promise<JobSettingsView> {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  const previous = await db.handoverSettings.findUnique({ where: { projectId } });
  const data = {
    ...(input.showQty !== undefined && { showQty: input.showQty }),
    ...(input.roomPerPage !== undefined && { roomPerPage: input.roomPerPage }),
    ...(input.cover !== undefined && { cover: input.cover }),
    ...(input.title !== undefined && { title: input.title }),
    ...(input.coverFileId !== undefined && { coverFileId: input.coverFileId ?? null }),
    ...(input.roomOrder !== undefined && { roomOrder: [...new Set(input.roomOrder.map((room) => cleanRoom(room)!).filter(Boolean))] }),
  };
  await db.$transaction(async (tx) => {
    if (input.coverFileId && input.coverFileId !== previous?.coverFileId) {
      try {
        await attachFile(tx, input.coverFileId, { companyId, userId: ctx.userId, blockId: MOD });
      } catch {
        throw badRequest("That picture can't be used. Try uploading it again.");
      }
    }
    await tx.handoverSettings.upsert({ where: { projectId }, create: { projectId, companyId, ...data }, update: data });
    // A replaced or removed cover picture isn't used anywhere else.
    if (input.coverFileId !== undefined && previous?.coverFileId && previous.coverFileId !== input.coverFileId) await purgeStoredFile(tx, previous.coverFileId);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId, entityType: "HandoverSettings", entityId: projectId, action: "updated", diff: data });
  });
  return jobSettingsFor(projectId);
}

export async function getCompanySettings(ctx: RequestContext) {
  return companySettingsFor(requireCompany(ctx));
}

export async function saveCompanySettings(ctx: RequestContext, input: CompanySettingsInput): Promise<CompanySettingsView> {
  const companyId = requireCompany(ctx);
  const tradeNames = Object.fromEntries(Object.entries(input.tradeNames).filter(([trade, name]) => TRADE_ORDER.includes(trade) && name && name !== tradeName(trade)));
  const tradeColumns = Object.fromEntries(Object.entries(input.tradeColumns).filter(([trade, hidden]) => TRADE_ORDER.includes(trade) && hidden.length));
  const data = { title: input.title, tradeNames, tradeColumns };
  await db.$transaction(async (tx) => {
    await tx.handoverCompanySettings.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "HandoverCompanySettings", entityId: companyId, action: "updated", diff: data });
  });
  return companySettingsFor(companyId);
}

/** Rooms already typed on the job, for suggestions. */
export async function jobRooms(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  const [items, settings] = await Promise.all([db.handoverItem.findMany({ where: { companyId, projectId }, select: { room: true, createdAt: true } }), jobSettingsFor(projectId)]);
  return orderedRooms(items, settings.roomOrder);
}

/** A job's cover picture can be seen by anyone in the business who can see the job. */
export async function canReadHandoverFile(ctx: RequestContext, fileId: string): Promise<boolean> {
  if (!ctx.companyId) return false;
  const settings = await db.handoverSettings.findFirst({ where: { companyId: ctx.companyId, coverFileId: fileId }, select: { projectId: true } });
  return !!settings && (await canSeeJob(ctx, settings.projectId));
}
