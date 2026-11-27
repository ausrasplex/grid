// How clients find the business (docs/quotations-block.md "Lead source"):
// one editable list per business, started with a sensible set the first
// time it's needed. A client can have one (optional); Referral also asks
// who referred them. A job can say otherwise (projects' leadSourceId).
// The Analytics Block reads these; nothing here asks for extra typing.

import { badRequest, conflict, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, type Tx } from "@grid/db";
import type { LeadSourceInput } from "./validation";

const MOD = "clients";

/** The starting list, in order. "Referral" asks who referred them. */
export const STARTING_LEAD_SOURCES = ["Google", "Facebook/Instagram", "Word of mouth", "Referral", "Van signage", "Builder", "Repeat client", "Other"] as const;
const REFERRAL_NAME = "Referral";

export interface LeadSourceRow {
  id: string;
  name: string;
  isReferral: boolean;
  hidden: boolean;
  /** Clients on the list that have it. */
  clientCount: number;
}

const leadSourceSelect = { id: true, name: true, isReferral: true, hiddenAt: true, _count: { select: { clients: { where: { deletedAt: null } } } } } as const;
const toRow = ({ hiddenAt, _count, ...source }: { id: string; name: string; isReferral: boolean; hiddenAt: Date | null; _count: { clients: number } }): LeadSourceRow => ({
  ...source,
  hidden: !!hiddenAt,
  clientCount: _count.clients,
});

/** Starts the business's list the first time anyone looks. Safe to run twice. */
async function ensureStarted(companyId: string) {
  if (await db.leadSource.count({ where: { companyId } })) return;
  await db.leadSource.createMany({
    data: STARTING_LEAD_SOURCES.map((name, index) => ({ companyId, name, isReferral: name === REFERRAL_NAME, sortOrder: index })),
    skipDuplicates: true,
  });
}

/** The list, in order. Hidden ones only when asked for (Settings › Clients › Lead sources). */
export async function listLeadSources(ctx: RequestContext, includeHidden = false): Promise<LeadSourceRow[]> {
  const companyId = requireCompany(ctx);
  await ensureStarted(companyId);
  const rows = await db.leadSource.findMany({
    where: { companyId, ...(includeHidden ? {} : { hiddenAt: null }) },
    select: leadSourceSelect,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toRow);
}

/** Add one, or rename, hide or show one. */
export async function saveLeadSource(ctx: RequestContext, id: string | null, input: LeadSourceInput): Promise<LeadSourceRow> {
  const companyId = requireCompany(ctx);
  await ensureStarted(companyId);
  return db.$transaction(async (tx) => {
    const clash = input.name ? await tx.leadSource.findFirst({ where: { companyId, name: { equals: input.name, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) }, select: { id: true } }) : null;
    if (clash) throw conflict(`"${input.name}" is already on the list`);
    if (id) {
      const before = await tx.leadSource.findFirst({ where: { id, companyId }, select: { name: true, hiddenAt: true } });
      if (!before) throw notFound("Lead source not found");
      const data = {
        ...(input.name ? { name: input.name } : {}),
        ...(input.hidden === undefined ? {} : { hiddenAt: input.hidden ? (before.hiddenAt ?? new Date()) : null }),
      };
      const row = await tx.leadSource.update({ where: { id }, data, select: leadSourceSelect });
      const action = input.hidden === true && !before.hiddenAt ? "hidden" : input.hidden === false && before.hiddenAt ? "shown" : "updated";
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "LeadSource", entityId: id, action, diff: { before: before.name, name: row.name } });
      return toRow(row);
    }
    if (!input.name) throw badRequest("Give it a name");
    const last = await tx.leadSource.aggregate({ where: { companyId }, _max: { sortOrder: true } });
    const row = await tx.leadSource.create({ data: { companyId, name: input.name, sortOrder: (last._max.sortOrder ?? 0) + 1 }, select: leadSourceSelect });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "LeadSource", entityId: row.id, action: "created", diff: { name: row.name } });
    return toRow(row);
  });
}

/**
 * A lead source a client or job can be given now: this business's, and not
 * hidden (keeping the one it already has is fine even if it's since been
 * hidden). Returns it, so the caller knows whether it's the referral one.
 */
export async function requireLeadSource(tx: Tx, companyId: string, id: string, current: string | null = null) {
  const source = await tx.leadSource.findFirst({ where: { id, companyId }, select: { id: true, name: true, isReferral: true, hiddenAt: true } });
  if (!source || (source.hiddenAt && source.id !== current)) throw badRequest("Pick how they found you from the list");
  return source;
}

/** Lead source names by id (this business's, hidden ones included), for showing a job's. */
export async function leadSourceNames(companyId: string, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return new Map();
  const rows = await db.leadSource.findMany({ where: { companyId, id: { in: wanted } }, select: { id: true, name: true } });
  return new Map(rows.map((row) => [row.id, row.name]));
}
