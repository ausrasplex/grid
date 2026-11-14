// The Activity log (Settings › Activity): who changed what in the business,
// when, and from which device and IP address. Read from the audit log every
// Block writes to (`audit()` in @grid/db). Your own account changes (like
// your email) show too, since they belong to no business.

import { app, requireCompany, type RequestContext } from "@grid/core";
import { db, type Prisma } from "@grid/db";
import { capital, summaryOf, whatOf } from "./activity-words";

export interface ActivityRow {
  id: string;
  at: Date;
  /** Who did it ("Jesse Morelli"), or null for Grid itself (background work). */
  who: string | null;
  whoId: string | null;
  /** "Deleted a site note", "Job: covers changed". */
  summary: string;
  /** The thing's name, when the change says it ("Lockbox", "Q-1004"). */
  what: string | null;
  /** Which part of Grid made it ("Sites", "Photos"). */
  part: string;
  details: unknown;
  ip: string | null;
  userAgent: string | null;
}

const PAGE = 50;

/**
 * A page of the business's activity, newest first. `before` is the last
 * row's id from the previous page; `person` narrows it to one person.
 */
export async function listActivity(ctx: RequestContext, options: { before?: string; person?: string } = {}): Promise<{ rows: ActivityRow[]; more: boolean }> {
  const companyId = requireCompany(ctx);
  const where: Prisma.AuditLogWhereInput = {
    OR: [{ companyId }, { companyId: null, actorId: ctx.userId }],
    ...(options.person ? { actorId: options.person } : {}),
  };
  if (options.before) {
    const last = await db.auditLog.findFirst({ where: { id: options.before }, select: { createdAt: true, id: true } });
    if (last) {
      where.AND = [{ OR: [{ createdAt: { lt: last.createdAt } }, { createdAt: last.createdAt, id: { lt: last.id } }] }];
    }
  }
  const found = await db.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: PAGE + 1 });
  const page = found.slice(0, PAGE);
  const people = await db.user.findMany({ where: { id: { in: [...new Set(page.map((row) => row.actorId).filter((id): id is string => !!id))] } }, select: { id: true, name: true } });
  const name = new Map(people.map((person) => [person.id, person.name]));
  const registry = app().registry;
  return {
    more: found.length > PAGE,
    rows: page.map((row) => ({
      id: row.id,
      at: row.createdAt,
      who: row.actorId ? (name.get(row.actorId) ?? "Someone") : null,
      whoId: row.actorId,
      summary: summaryOf(row.entityType, row.action),
      what: whatOf(row.diff),
      part: registry.get(row.blockId)?.name ?? capital(row.blockId),
      details: row.diff,
      ip: row.ip,
      userAgent: row.userAgent,
    })),
  };
}

/** The people who appear in the business's activity, for the "Who" filter. */
export async function activityPeople(ctx: RequestContext): Promise<{ id: string; name: string }[]> {
  const companyId = requireCompany(ctx);
  const members = await db.membership.findMany({ where: { companyId }, select: { user: { select: { id: true, name: true } } } });
  return members.map((member) => member.user).sort((first, second) => first.name.localeCompare(second.name));
}
