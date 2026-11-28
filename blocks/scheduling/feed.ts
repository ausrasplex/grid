// The phone calendar feed (docs/scheduling-block.md "Phone calendar"): a
// private link per person that their phone's calendar subscribes to. It
// shows their visits (30 days back and everything ahead) and their time
// off, read-only: Grid stays the one place visits are changed.
// The token is the only key (nobody signs in): stored hashed to find it and
// encrypted to show the link again. "Get a new link" stops the old one.

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { notFound, requireCompany, tooManyRequests, type RequestContext } from "@grid/core";
import { audit, db, decryptSecret, encryptSecret, publicBaseUrl } from "@grid/db";
import { LEAVE_TYPE_WORDS, approvedLeave } from "@grid/block-companies";
import { clientsById } from "@grid/block-clients";
import { scheduleJobs } from "@grid/block-projects";
import { calendarFile, type IcsEvent } from "./ics";
import { addDays, localDay, zonedMoment } from "./times";

const MOD = "scheduling";
const DAYS_BACK = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** https://…/api/public/scheduling/feed/<token>.ics and the same as webcal:// (opens the phone's calendar). */
function links(token: string) {
  const address = `${publicBaseUrl()}/api/public/scheduling/feed/${token}.ics`;
  return { address, subscribe: address.replace(/^https?:\/\//, "webcal://") };
}

export interface FeedView {
  /** null until you turn it on. */
  address: string | null;
  subscribe: string | null;
  createdAt: Date | null;
  lastUsedAt: Date | null;
}

export async function myFeed(ctx: RequestContext): Promise<FeedView> {
  const companyId = requireCompany(ctx);
  const feed = await db.calendarFeed.findUnique({ where: { companyId_userId: { companyId, userId: ctx.userId } } });
  if (!feed) return { address: null, subscribe: null, createdAt: null, lastUsedAt: null };
  return { ...links(decryptSecret(feed.tokenEnc)), createdAt: feed.createdAt, lastUsedAt: feed.lastUsedAt };
}

/** Turn the feed on, or get a new link (the old one stops working straight away). */
export async function newFeedLink(ctx: RequestContext): Promise<FeedView> {
  const companyId = requireCompany(ctx);
  const token = randomBytes(24).toString("base64url");
  await db.$transaction(async (tx) => {
    const before = await tx.calendarFeed.findUnique({ where: { companyId_userId: { companyId, userId: ctx.userId } }, select: { id: true } });
    const data = { tokenHash: hashToken(token), tokenEnc: encryptSecret(token), createdAt: new Date(), lastUsedAt: null };
    const feed = await tx.calendarFeed.upsert({ where: { companyId_userId: { companyId, userId: ctx.userId } }, create: { companyId, userId: ctx.userId, ...data }, update: data });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "CalendarFeed", entityId: feed.id, action: before ? "new link" : "turned on", diff: {} });
  });
  return myFeed(ctx);
}

export async function stopFeed(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const feed = await tx.calendarFeed.findUnique({ where: { companyId_userId: { companyId, userId: ctx.userId } }, select: { id: true } });
    if (!feed) return;
    await tx.calendarFeed.delete({ where: { id: feed.id } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "CalendarFeed", entityId: feed.id, action: "turned off", diff: {} });
  });
  return myFeed(ctx);
}

// ─── The file a calendar fetches ────────────────────────────────────────

/** Calendars check about hourly; this stops a stuck one hammering the server. */
const recentFetches = new Map<string, number[]>();
const FETCHES_PER_HOUR = 60;
function tooOften(tokenHash: string) {
  const now = Date.now();
  const recent = (recentFetches.get(tokenHash) ?? []).filter((at) => now - at < 3_600_000);
  recent.push(now);
  recentFetches.set(tokenHash, recent);
  return recent.length > FETCHES_PER_HOUR;
}

/** GET /api/public/scheduling/feed/<token>.ics. Anything wrong is the same 404. */
export async function feedFile(file: string): Promise<Response> {
  const token = file.replace(/\.ics$/, "");
  if (!/^[\w-]{20,64}$/.test(token)) throw notFound();
  const tokenHash = hashToken(token);
  const feed = await db.calendarFeed.findUnique({ where: { tokenHash } });
  if (!feed) throw notFound();
  // Only while they're still in the business.
  const member = await db.membership.findFirst({ where: { companyId: feed.companyId, userId: feed.userId, status: "ACTIVE" }, select: { id: true } });
  const company = await db.company.findFirst({ where: { id: feed.companyId, deletedAt: null }, select: { name: true } });
  if (!member || !company) throw notFound();
  if (tooOften(tokenHash)) throw tooManyRequests("Too many checks: try again in a while");

  // Their own view of the business: the jobs it can see (no permissions are used beyond that).
  const ctx: RequestContext = { userId: feed.userId, companyId: feed.companyId, permissions: new Set(), enabledBlocks: new Set(), solo: false };
  const today = localDay(new Date());
  const from = new Date(Date.now() - DAYS_BACK * 86_400_000);
  const visits = await db.visit.findMany({
    where: { companyId: feed.companyId, assignedUserId: feed.userId, status: { not: "CANCELLED" }, endsAt: { gte: from } },
    orderBy: { startsAt: "asc" },
  });
  const jobs = new Map((await scheduleJobs(ctx, { ids: visits.map((visit) => visit.projectId) })).map((job) => [job.id, job]));
  const clients = await clientsById(db, feed.companyId, [...jobs.values()].map((job) => job.clientId));
  const base = publicBaseUrl();

  const events: IcsEvent[] = [];
  for (const visit of visits) {
    const job = jobs.get(visit.projectId);
    if (!job || job.archived) continue;
    const client = job.clientId ? clients.get(job.clientId) : undefined;
    const phone = client?.phone ?? client?.business?.phone ?? null;
    const summary = [[job.name, visit.label].filter(Boolean).join(": "), visit.isTentative && visit.status === "BOOKED" ? "(Tentative)" : null, visit.status === "DONE" ? "(Done)" : null].filter(Boolean).join(" ");
    const days = visit.isAllDay ? { firstDay: localDay(visit.startsAt), lastDay: localDay(new Date(visit.endsAt.getTime() - 1)) } : { startsAt: visit.startsAt, endsAt: visit.endsAt };
    events.push({
      uid: `visit-${visit.id}@grid`,
      summary,
      ...days,
      location: job.address || null,
      description: [client ? `Client: ${client.label}${phone ? `, ${phone}` : ""}` : job.clientName ? `Client: ${job.clientName}` : null, job.jobNumber ? `Job ${job.jobNumber}` : null, visit.notes, base ? `Open in Grid: ${base}/jobs/${job.id}` : null]
        .filter(Boolean)
        .join("\n"),
      url: base ? `${base}/jobs/${job.id}` : null,
      status: visit.isTentative ? "TENTATIVE" : "CONFIRMED",
      updatedAt: visit.updatedAt,
    });
  }

  // Time off: "Away", never the private note. Some hours on one day is a timed event; days (and half days) are all day.
  const leave = await approvedLeave(feed.companyId, { first: addDays(today, -DAYS_BACK), last: addDays(today, 730) }, [feed.userId]);
  for (const entry of leave) {
    const base = { uid: `leave-${entry.id}@grid`, description: LEAVE_TYPE_WORDS[entry.type], busy: true };
    if (entry.firstDayPart === "HOURS" && entry.fromTime && entry.toTime) {
      events.push({ ...base, summary: "Away", startsAt: zonedMoment(entry.startsOn, entry.fromTime), endsAt: zonedMoment(entry.startsOn, entry.toTime) });
      continue;
    }
    const part = entry.startsOn === entry.endsOn && entry.firstDayPart !== "WHOLE" ? (entry.firstDayPart === "MORNING" ? " (morning)" : " (afternoon)") : "";
    events.push({ ...base, summary: `Away${part}`, firstDay: entry.startsOn, lastDay: entry.endsOn, busy: false });
  }

  await db.calendarFeed.update({ where: { id: feed.id }, data: { lastUsedAt: new Date() } });
  return new Response(calendarFile(`${company.name} (Grid)`, events), {
    headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'inline; filename="grid.ics"', "cache-control": "no-store" },
  });
}
