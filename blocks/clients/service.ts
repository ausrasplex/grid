// Public service API of the clients block (core): one list of the people
// and businesses a company works for, used by jobs and quotes.

import { app, badRequest, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, type Tx } from "@grid/db";
import type { ClientInput } from "./validation";

const MOD = "clients";

export interface ClientRow {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  abn: string | null;
  notes: string | null;
}

const clientSelect = { id: true, name: true, contactName: true, email: true, phone: true, address: true, abn: true, notes: true } as const;

/** Payload of "clients.renamed": jobs keep a copy of the name for search and lists. */
export interface ClientRenamedEvent {
  clientId: string;
  companyId: string;
  name: string;
}

export async function listClients(ctx: RequestContext, query = ""): Promise<ClientRow[]> {
  const companyId = requireCompany(ctx);
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  return db.client.findMany({
    where: {
      companyId,
      deletedAt: null,
      AND: words.map((word) => ({
        OR: [
          { name: { contains: word, mode: "insensitive" as const } },
          { contactName: { contains: word, mode: "insensitive" as const } },
          { email: { contains: word, mode: "insensitive" as const } },
          { phone: { contains: word, mode: "insensitive" as const } },
          { address: { contains: word, mode: "insensitive" as const } },
        ],
      })),
    },
    select: clientSelect,
    orderBy: { name: "asc" },
    take: 200,
  });
}

export async function saveClient(ctx: RequestContext, id: string | null, input: ClientInput): Promise<ClientRow> {
  const companyId = requireCompany(ctx);
  let renamed = false;
  const client = await db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.client.findFirst({ where: { id, companyId, deletedAt: null } });
      if (!before) throw notFound("Client not found");
      renamed = before.name !== input.name;
      const client = await tx.client.update({ where: { id }, data: input, select: clientSelect });
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Client", entityId: id, action: "updated", diff: { before: { name: before.name, email: before.email, phone: before.phone } } });
      return client;
    }
    const client = await tx.client.create({ data: { companyId, ...input }, select: clientSelect });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Client", entityId: client.id, action: "created", diff: { name: client.name } });
    return client;
  });
  if (renamed) {
    const payload: ClientRenamedEvent = { clientId: client.id, companyId, name: client.name };
    await app().events.emit("clients.renamed", payload, { emittedBy: MOD, companyId, actorId: ctx.userId });
  }
  return client;
}

/** Removed from the list; jobs and quotes that name it keep its details. */
export async function deleteClient(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const result = await tx.client.updateMany({ where: { id, companyId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (!result.count) throw notFound("Client not found");
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Client", entityId: id, action: "deleted" });
  });
  return { id, deleted: true };
}

/**
 * A client that can be picked now (this company's, not removed), or a 400.
 * Used when a job or quote is pointed at a client.
 */
export async function requireClient(tx: Tx, companyId: string, id: string): Promise<ClientRow> {
  const client = await tx.client.findFirst({ where: { id, companyId, deletedAt: null }, select: clientSelect });
  if (!client) throw badRequest("Client not found");
  return client;
}

/** Clients by id, removed ones included (a quote still shows who it was for). Only this company's. */
export async function clientsById(tx: Tx, companyId: string, ids: (string | null | undefined)[]): Promise<Map<string, ClientRow>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return new Map();
  const rows = await tx.client.findMany({ where: { id: { in: wanted }, companyId }, select: clientSelect });
  return new Map(rows.map((row) => [row.id, row]));
}

/** Ids of this company's clients whose name contains `word` (for searching jobs and quotes by client). */
export async function clientIdsNamed(companyId: string, word: string): Promise<string[]> {
  const rows = await db.client.findMany({ where: { companyId, name: { contains: word, mode: "insensitive" } }, select: { id: true }, take: 500 });
  return rows.map((row) => row.id);
}

/** One of this company's clients (removed ones too), or null. */
export async function getClient(ctx: RequestContext, id: string): Promise<ClientRow | null> {
  const companyId = requireCompany(ctx);
  return db.client.findFirst({ where: { id, companyId }, select: clientSelect });
}
