// My tickets & licences: each person's own, so everything here is scoped to
// ctx.userId, not a business (the one place in Grid that is). Numbers are
// encrypted; card photos are StoredFiles only their owner can open.

import { app, badRequest, notFound, type CleanupItem, type RequestContext } from "@grid/core";
import { attachFile, audit, db, decryptSecret, encryptSecret, purgeStoredFile, storedBytes, type Tx } from "@grid/db";
import { reminderDue, ticketStatus, ticketTypeName, todayHere, type TicketStatus } from "./types";
import type { TicketInput } from "./validation";

const MOD = "credentials";

export interface TicketView {
  id: string;
  type: string;
  /** "EWP licence (yellow card)", or the name for "Other". */
  title: string;
  /** Extra words ("A-grade"), or the name for "Other". */
  name: string;
  number: string | null;
  issuer: string | null;
  /** "YYYY-MM-DD" */
  issuedOn: string | null;
  expiresOn: string | null;
  frontFileId: string | null;
  backFileId: string | null;
  notes: string | null;
  status: TicketStatus;
  daysLeft: number | null;
}

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
const toDate = (value: string | null) => (value ? new Date(`${value}T00:00:00Z`) : null);

type Row = Awaited<ReturnType<typeof db.credential.findFirstOrThrow>>;

function view(row: Row, today: string): TicketView {
  const expiresOn = day(row.expiresOn);
  let number: string | null = null;
  try {
    number = row.numberEnc ? decryptSecret(row.numberEnc) : null;
  } catch {
    number = null;
  }
  return {
    id: row.id,
    type: row.type,
    title: row.type === "other" ? row.name || "Ticket" : ticketTypeName(row.type),
    name: row.name,
    number,
    issuer: row.issuer,
    issuedOn: day(row.issuedOn),
    expiresOn,
    frontFileId: row.frontFileId,
    backFileId: row.backFileId,
    notes: row.notes,
    ...ticketStatus(expiresOn, today),
  };
}

/** Expired first, then the soonest to run out, then ones that don't expire. */
const ORDER: Record<TicketStatus, number> = { expired: 0, soon: 1, current: 2, "no-expiry": 3 };

export async function myTickets(ctx: RequestContext): Promise<TicketView[]> {
  const rows = await db.credential.findMany({ where: { userId: ctx.userId, deletedAt: null } });
  const today = todayHere();
  return rows
    .map((row) => view(row, today))
    .sort((first, second) => ORDER[first.status] - ORDER[second.status] || (first.daysLeft ?? 1e9) - (second.daysLeft ?? 1e9) || first.title.localeCompare(second.title));
}

async function ownTicket(tx: Tx, ctx: RequestContext, id: string) {
  const row = await tx.credential.findFirst({ where: { id, userId: ctx.userId, deletedAt: null } });
  if (!row) throw notFound("Ticket not found");
  return row;
}

/**
 * New photos are attached to this block (they were uploaded to /api/files);
 * a photo replaced or removed is deleted straight away.
 */
async function swapPhotos(tx: Tx, ctx: RequestContext, before: { frontFileId: string | null; backFileId: string | null }, input: TicketInput) {
  for (const side of ["frontFileId", "backFileId"] as const) {
    const next = input[side];
    if (next === undefined || next === before[side]) continue;
    if (next) {
      if (!ctx.companyId) throw badRequest("Pick a business first, then add the photo");
      await attachFile(tx, next, { companyId: ctx.companyId, userId: ctx.userId, blockId: MOD });
    }
    if (before[side]) await purgeStoredFile(tx, before[side]!);
  }
}

function fields(input: TicketInput) {
  return {
    type: input.type,
    name: input.name,
    numberEnc: input.number ? encryptSecret(input.number) : null,
    issuer: input.issuer,
    issuedOn: toDate(input.issuedOn),
    expiresOn: toDate(input.expiresOn),
    notes: input.notes,
  };
}

export async function addTicket(ctx: RequestContext, input: TicketInput): Promise<TicketView[]> {
  await db.$transaction(async (tx) => {
    await swapPhotos(tx, ctx, { frontFileId: null, backFileId: null }, input);
    const row = await tx.credential.create({
      data: { userId: ctx.userId, ...fields(input), frontFileId: input.frontFileId ?? null, backFileId: input.backFileId ?? null },
    });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, entityType: "Credential", entityId: row.id, action: "added", diff: { type: input.type, name: input.name, expiresOn: input.expiresOn } });
  });
  return myTickets(ctx);
}

export async function updateTicket(ctx: RequestContext, id: string, input: TicketInput): Promise<TicketView[]> {
  await db.$transaction(async (tx) => {
    const before = await ownTicket(tx, ctx, id);
    await swapPhotos(tx, ctx, before, input);
    const dateChanged = day(before.expiresOn) !== input.expiresOn;
    await tx.credential.update({
      where: { id },
      data: {
        ...fields(input),
        ...(input.frontFileId !== undefined ? { frontFileId: input.frontFileId } : {}),
        ...(input.backFileId !== undefined ? { backFileId: input.backFileId } : {}),
        // A new expiry date (renewed): reminders start again.
        ...(dateChanged ? { remindedAt: null } : {}),
      },
    });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      entityType: "Credential",
      entityId: id,
      action: dateChanged ? "renewed" : "updated",
      diff: { type: input.type, expiresOn: { from: day(before.expiresOn), to: input.expiresOn } },
    });
  });
  return myTickets(ctx);
}

/** Deleted: gone from the list now; its photos are removed straight away, the record at the next clean-up. */
export async function deleteTicket(ctx: RequestContext, id: string): Promise<TicketView[]> {
  await db.$transaction(async (tx) => {
    const row = await ownTicket(tx, ctx, id);
    for (const fileId of [row.frontFileId, row.backFileId]) if (fileId) await purgeStoredFile(tx, fileId);
    await tx.credential.update({ where: { id }, data: { deletedAt: new Date(), frontFileId: null, backFileId: null } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, entityType: "Credential", entityId: id, action: "deleted", diff: { type: row.type, name: row.name } });
  });
  return myTickets(ctx);
}

/** /api/files asks this: a card photo is only ever shown to the person it belongs to. */
export async function canReadTicketFile(ctx: RequestContext, fileId: string): Promise<boolean> {
  return !!(await db.credential.findFirst({ where: { userId: ctx.userId, deletedAt: null, OR: [{ frontFileId: fileId }, { backFileId: fileId }] }, select: { id: true } }));
}

/** For the Home card: how many of your tickets have run out or are about to. */
export async function ticketAlerts(ctx: RequestContext): Promise<{ expired: number; soon: number }> {
  const tickets = await myTickets(ctx);
  return { expired: tickets.filter((ticket) => ticket.status === "expired").length, soon: tickets.filter((ticket) => ticket.status === "soon").length };
}

const appUrl = (path: string) => `${(process.env.BETTER_AUTH_URL || "").replace(/\/$/, "")}${path}`;

/**
 * The morning reminder (job credentials.remind): one email per person listing
 * the tickets that reached 60, 30 or 7 days before expiry, or expired. Each
 * reminder goes once. Without email set up, it's only written to the log.
 */
export async function sendReminders(): Promise<void> {
  const today = todayHere();
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 60);
  const rows = await db.credential.findMany({ where: { deletedAt: null, expiresOn: { lte: horizon } } });
  const byUser = new Map<string, { row: Row; due: number; ticket: TicketView }[]>();
  for (const row of rows) {
    const ticket = view(row, today);
    if (ticket.daysLeft === null) continue;
    const due = reminderDue(ticket.daysLeft, row.remindedAt);
    if (due === null) continue;
    byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), { row, due, ticket }]);
  }
  for (const [userId, items] of byUser) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    if (!user) continue;
    const lines = items.map(({ ticket }) => {
      const when = ticket.daysLeft! < 0 ? `expired on ${ticket.expiresOn}` : ticket.daysLeft === 0 ? "expires today" : `expires on ${ticket.expiresOn} (in ${ticket.daysLeft} days)`;
      return `- ${ticket.title}${ticket.name && ticket.type !== "other" ? ` (${ticket.name})` : ""}: ${when}`;
    });
    const anyExpired = items.some(({ ticket }) => ticket.daysLeft! <= 0);
    try {
      await app().mail.send({
        to: user.email,
        subject: anyExpired ? "A ticket or licence has run out" : "Tickets or licences expiring soon",
        text: `Hi ${user.name},\n\n${lines.join("\n")}\n\nOnce you've renewed, update the expiry date (and photo) in Grid:\n${appUrl("/tickets")}\n`,
      });
    } catch (error) {
      console.error("[credentials] couldn't send the reminder email", error);
      continue; // try again tomorrow
    }
    await db.$transaction(async (tx) => {
      for (const { row, due } of items) await tx.credential.update({ where: { id: row.id }, data: { remindedAt: due } });
    });
  }
}

/** The storage clean-up: deleted tickets' records go for good (their photos already went). */
export async function purgeDeleted(options: { before: Date; dryRun: boolean }): Promise<CleanupItem[]> {
  const rows = await db.credential.findMany({ where: { deletedAt: { lt: options.before } }, take: 2000 });
  const items: CleanupItem[] = [];
  for (const row of rows) {
    const files = await db.storedFile.findMany({ where: { id: { in: [row.frontFileId, row.backFileId].filter((id): id is string => !!id) }, purgedAt: null } });
    items.push({ companyId: null, kind: "deleted-ticket", label: row.type === "other" ? row.name || "Ticket" : ticketTypeName(row.type), refId: row.id, bytes: files.reduce((total, file) => total + storedBytes(file), 0) });
    if (options.dryRun) continue;
    await db.$transaction(async (tx) => {
      for (const file of files) await purgeStoredFile(tx, file.id);
      await tx.credential.delete({ where: { id: row.id } });
    });
  }
  return items;
}
