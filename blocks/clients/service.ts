// Public service API of the clients block (core): one list of the people
// and businesses a company works for, used by jobs and quotes. A client can
// be a person at a business (Sam Lee, Project Manager at Honeywell); the
// business holds the ABN and office details (docs/quotations-block.md
// "Clients and businesses").

import { app, badRequest, conflict, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, pictureUrl, type Tx } from "@grid/db";
import { clientLabel, type BusinessDetails } from "./people";
import type { BusinessInput, ClientInput } from "./validation";

const MOD = "clients";

export interface ClientRow {
  id: string;
  name: string;
  contactName: string | null;
  businessId: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  abn: string | null;
  notes: string | null;
  /** The business they work for, with what a quote borrows from it. */
  business: BusinessDetails | null;
  /** "Sam Lee, Honeywell", or just the name: what jobs and quote lists show. */
  label: string;
  /** Their own photo, or null. */
  photoUrl: string | null;
  /** What to show for them: their photo, else their business's logo, else null (initials). */
  pictureUrl: string | null;
}

const businessDetailsSelect = { id: true, name: true, abn: true, email: true, phone: true, address: true } as const;
const clientSelect = {
  id: true,
  name: true,
  contactName: true,
  businessId: true,
  role: true,
  email: true,
  phone: true,
  address: true,
  abn: true,
  notes: true,
  photoKey: true,
  business: { select: { ...businessDetailsSelect, logoKey: true } },
} as const;

type ClientRecord = Omit<ClientRow, "label" | "photoUrl" | "pictureUrl" | "business"> & { photoKey: string | null; business: (BusinessDetails & { logoKey: string | null }) | null };
const toRow = ({ photoKey, business, ...client }: ClientRecord): ClientRow => {
  const { logoKey, ...details } = business ?? { logoKey: null };
  return {
    ...client,
    business: business ? (details as BusinessDetails) : null,
    label: clientLabel({ name: client.name, business }),
    photoUrl: pictureUrl(photoKey),
    pictureUrl: pictureUrl(photoKey ?? logoKey),
  };
};

/**
 * Payload of "clients.renamed": jobs keep a copy of the client's label for
 * search and lists. Sent when a client's name or business changes, and for
 * each of a business's people when the business is renamed. `name` is the
 * label ("Sam Lee, Honeywell").
 */
export interface ClientRenamedEvent {
  clientId: string;
  companyId: string;
  name: string;
}

const searchWords = (query: string) => query.trim().split(/\s+/).filter(Boolean).slice(0, 5);

export async function listClients(ctx: RequestContext, query = ""): Promise<ClientRow[]> {
  const companyId = requireCompany(ctx);
  const rows = await db.client.findMany({
    where: {
      companyId,
      deletedAt: null,
      AND: searchWords(query).map((word) => ({
        OR: [
          { name: { contains: word, mode: "insensitive" as const } },
          { contactName: { contains: word, mode: "insensitive" as const } },
          { role: { contains: word, mode: "insensitive" as const } },
          { business: { name: { contains: word, mode: "insensitive" as const } } },
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
  return rows.map(toRow);
}

export async function emitRenamed(ctx: RequestContext, companyId: string, rows: { id: string; label: string }[]) {
  for (const row of rows) {
    const payload: ClientRenamedEvent = { clientId: row.id, companyId, name: row.label };
    await app().events.emit("clients.renamed", payload, { emittedBy: MOD, companyId, actorId: ctx.userId });
  }
}

/** A business that can be picked now (this company's, not removed), or a 400. */
async function requireBusiness(tx: Tx, companyId: string, id: string) {
  const business = await tx.clientBusiness.findFirst({ where: { id, companyId, deletedAt: null }, select: { id: true } });
  if (!business) throw badRequest("Business not found");
  return business;
}

export async function saveClient(ctx: RequestContext, id: string | null, input: ClientInput): Promise<ClientRow> {
  const companyId = requireCompany(ctx);
  let relabelled = false;
  const client = await db.$transaction(async (tx) => {
    // Left out keeps the business they're at; a new client starts with none.
    const { businessId: wanted, ...fields } = input;
    if (id) {
      const before = await tx.client.findFirst({ where: { id, companyId, deletedAt: null }, select: clientSelect });
      if (!before) throw notFound("Client not found");
      // Keeping a business that's since been removed is fine; picking one isn't.
      if (wanted && wanted !== before.businessId) await requireBusiness(tx, companyId, wanted);
      const data = { ...fields, ...(wanted === undefined ? {} : { businessId: wanted }) };
      const client = toRow(await tx.client.update({ where: { id }, data, select: clientSelect }));
      relabelled = toRow(before).label !== client.label;
      await audit(tx, {
        blockId: MOD,
        actorId: ctx.userId,
        companyId,
        entityType: "Client",
        entityId: id,
        action: "updated",
        diff: { before: { name: before.name, business: before.business?.name ?? null, role: before.role, email: before.email, phone: before.phone } },
      });
      return client;
    }
    if (wanted) await requireBusiness(tx, companyId, wanted);
    const client = toRow(await tx.client.create({ data: { companyId, ...fields, businessId: wanted ?? null }, select: clientSelect }));
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Client", entityId: client.id, action: "created", diff: { name: client.name, business: client.business?.name ?? null } });
    return client;
  });
  if (relabelled) await emitRenamed(ctx, companyId, [client]);
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
  return toRow(client);
}

/** Clients by id, removed ones included (a quote still shows who it was for). Only this company's. */
export async function clientsById(tx: Tx, companyId: string, ids: (string | null | undefined)[]): Promise<Map<string, ClientRow>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return new Map();
  const rows = await tx.client.findMany({ where: { id: { in: wanted }, companyId }, select: clientSelect });
  return new Map(rows.map((row) => [row.id, toRow(row)]));
}

/** Ids of this company's clients whose name, or business's name, contains `word` (for searching jobs and quotes by client). */
export async function clientIdsNamed(companyId: string, word: string): Promise<string[]> {
  const rows = await db.client.findMany({
    where: { companyId, OR: [{ name: { contains: word, mode: "insensitive" } }, { business: { name: { contains: word, mode: "insensitive" } } }] },
    select: { id: true },
    take: 500,
  });
  return rows.map((row) => row.id);
}

/** One client for their page, removed ones included (old jobs link to them). */
export async function clientPage(ctx: RequestContext, id: string): Promise<ClientRow & { removed: boolean }> {
  const companyId = requireCompany(ctx);
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound("Client not found");
  const client = await db.client.findFirst({ where: { id, companyId }, select: { ...clientSelect, deletedAt: true } });
  if (!client) throw notFound("Client not found");
  const { deletedAt, ...rest } = client;
  return { ...toRow(rest), removed: !!deletedAt };
}

/** One of this company's clients (removed ones too), or null. */
export async function getClient(ctx: RequestContext, id: string): Promise<ClientRow | null> {
  const companyId = requireCompany(ctx);
  const client = await db.client.findFirst({ where: { id, companyId }, select: clientSelect });
  return client ? toRow(client) : null;
}

// --- businesses --------------------------------------------------------------

export interface BusinessRow extends BusinessDetails {
  notes: string | null;
  /** People at it still on the list. */
  peopleCount: number;
  /** Its logo, or null. */
  logoUrl: string | null;
}

const businessSelect = { ...businessDetailsSelect, notes: true, logoKey: true, _count: { select: { people: { where: { deletedAt: null } } } } } as const;
const toBusinessRow = ({ _count, logoKey, ...business }: { _count: { people: number }; logoKey: string | null } & Omit<BusinessRow, "peopleCount" | "logoUrl">): BusinessRow => ({
  ...business,
  peopleCount: _count.people,
  logoUrl: pictureUrl(logoKey),
});

export async function listBusinesses(ctx: RequestContext, query = ""): Promise<BusinessRow[]> {
  const companyId = requireCompany(ctx);
  const rows = await db.clientBusiness.findMany({
    where: {
      companyId,
      deletedAt: null,
      AND: searchWords(query).map((word) => ({
        OR: [
          { name: { contains: word, mode: "insensitive" as const } },
          { abn: { contains: word, mode: "insensitive" as const } },
          { address: { contains: word, mode: "insensitive" as const } },
          { people: { some: { deletedAt: null, name: { contains: word, mode: "insensitive" as const } } } },
        ],
      })),
    },
    select: businessSelect,
    orderBy: { name: "asc" },
    take: 200,
  });
  return rows.map(toBusinessRow);
}

export async function saveBusiness(ctx: RequestContext, id: string | null, input: BusinessInput): Promise<BusinessRow> {
  const companyId = requireCompany(ctx);
  let people: { id: string; label: string }[] = [];
  const business = await db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.clientBusiness.findFirst({ where: { id, companyId, deletedAt: null } });
      if (!before) throw notFound("Business not found");
      const business = await tx.clientBusiness.update({ where: { id }, data: input, select: businessSelect });
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "ClientBusiness", entityId: id, action: "updated", diff: { before: { name: before.name, abn: before.abn, phone: before.phone } } });
      // Renamed: their people's jobs show the new name (removed people's old jobs too).
      if (before.name !== business.name) {
        const rows = await tx.client.findMany({ where: { businessId: id, companyId }, select: { id: true, name: true } });
        people = rows.map((row) => ({ id: row.id, label: clientLabel({ name: row.name, business }) }));
      }
      return business;
    }
    const business = await tx.clientBusiness.create({ data: { companyId, ...input }, select: businessSelect });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "ClientBusiness", entityId: business.id, action: "created", diff: { name: business.name } });
    return business;
  });
  if (people.length) await emitRenamed(ctx, companyId, people);
  return toBusinessRow(business);
}

/** Only once nobody's left at it: move or remove its people first, so no job loses who it's for. */
export async function deleteBusiness(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const business = await tx.clientBusiness.findFirst({ where: { id, companyId, deletedAt: null }, select: businessSelect });
    if (!business) throw notFound("Business not found");
    if (business._count.people) throw conflict(`${business.name} still has ${business._count.people === 1 ? "1 person" : `${business._count.people} people`}. Move or remove them first.`);
    await tx.clientBusiness.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "ClientBusiness", entityId: id, action: "deleted" });
  });
  return { id, deleted: true };
}

/** One business for its page, with its people (removed businesses too: old links). */
export async function businessPage(ctx: RequestContext, id: string): Promise<BusinessRow & { removed: boolean; people: ClientRow[]; everyoneIds: string[] }> {
  const companyId = requireCompany(ctx);
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound("Business not found");
  const business = await db.clientBusiness.findFirst({ where: { id, companyId }, select: { ...businessSelect, deletedAt: true } });
  if (!business) throw notFound("Business not found");
  const everyone = await db.client.findMany({ where: { businessId: id, companyId }, select: { ...clientSelect, deletedAt: true }, orderBy: { name: "asc" } });
  const { deletedAt, ...rest } = business;
  return {
    ...toBusinessRow(rest),
    removed: !!deletedAt,
    people: everyone.filter((person) => !person.deletedAt).map(({ deletedAt: _removed, ...person }) => toRow(person)),
    // Removed people's jobs and quotes still count as the business's.
    everyoneIds: everyone.map((person) => person.id),
  };
}
