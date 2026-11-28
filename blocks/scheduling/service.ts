// Visits on jobs (docs/scheduling-block.md). A job has one or more visits;
// each is booked for whoever books it (teams pick a person later). Saving
// checks three things and warns, never blocks: a clash with another visit,
// a day over your daily limit, and your time off. "Book anyway" saves.

import "server-only";
import { badRequest, conflict, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, type Tx } from "@grid/db";
import { LEAVE_TYPE_WORDS, approvedLeave, type LeaveRow } from "@grid/block-companies";
import { scheduleJobs, type ScheduleJob } from "@grid/block-projects";
import { addDays, daysCovered, localDay, localTime, minutesOf, overlaps, serverTimeZone, timeOf, timeOffClashes, zonedMoment } from "./times";
import { dayWords, timeWords, whenWords } from "./words";
import type { SettingsInput, UserSettingsInput, VisitInput } from "./validation";

const MOD = "scheduling";

// ─── Settings ───────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS = { defaultVisitLengthMinutes: 120, dayStartsAt: "07:00", dayEndsAt: "15:30" };

export async function businessSettings(companyId: string) {
  const row = await db.schedulingSettings.findUnique({ where: { companyId } });
  return row ? { defaultVisitLengthMinutes: row.defaultVisitLengthMinutes, dayStartsAt: row.dayStartsAt, dayEndsAt: row.dayEndsAt } : DEFAULT_SETTINGS;
}

export async function userSettings(companyId: string, userId: string) {
  const row = await db.schedulingUserSettings.findUnique({ where: { companyId_userId: { companyId, userId } } });
  return { dailyVisitWarningLimit: row?.dailyVisitWarningLimit ?? null };
}

export async function getSettings(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const [business, mine] = await Promise.all([businessSettings(companyId), userSettings(companyId, ctx.userId)]);
  return { business, mine, timeZone: serverTimeZone() };
}

export async function saveBusinessSettings(ctx: RequestContext, input: SettingsInput) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    await tx.schedulingSettings.upsert({ where: { companyId }, create: { companyId, ...input }, update: input });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "SchedulingSettings", entityId: companyId, action: "updated", diff: input });
  });
  return businessSettings(companyId);
}

export async function saveUserSettings(ctx: RequestContext, input: UserSettingsInput) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    await tx.schedulingUserSettings.upsert({ where: { companyId_userId: { companyId, userId: ctx.userId } }, create: { companyId, userId: ctx.userId, ...input }, update: input });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "SchedulingUserSettings", entityId: ctx.userId, action: "updated", diff: input });
  });
  return userSettings(companyId, ctx.userId);
}

// ─── Visits ─────────────────────────────────────────────────────────────

export type VisitStatus = "BOOKED" | "DONE" | "CANCELLED";

export interface VisitRow {
  id: string;
  projectId: string;
  label: string | null;
  startsAt: Date;
  endsAt: Date;
  isAllDay: boolean;
  isTentative: boolean;
  status: VisitStatus;
  notes: string | null;
  assignedUserId: string | null;
  doneAt: Date | null;
  /** In the server's timezone, for the form and the schedule: "2026-12-03", "08:00". */
  day: string;
  lastDay: string;
  startTime: string;
  endTime: string;
  /** "Thu 3 Dec, 8:00 am – 10:00 am". */
  when: string;
}

const visitSelect = {
  id: true,
  projectId: true,
  label: true,
  startsAt: true,
  endsAt: true,
  isAllDay: true,
  isTentative: true,
  status: true,
  notes: true,
  assignedUserId: true,
  doneAt: true,
} as const;
type VisitRecord = Omit<VisitRow, "day" | "lastDay" | "startTime" | "endTime" | "when">;

function toRow(record: VisitRecord): VisitRow {
  const timeZone = serverTimeZone();
  const days = daysCovered(record.startsAt, record.endsAt, timeZone);
  const shape = { isAllDay: record.isAllDay, day: days[0]!, lastDay: days[days.length - 1]!, startTime: localTime(record.startsAt, timeZone), endTime: localTime(record.endsAt, timeZone) };
  return { ...record, ...shape, when: whenWords(shape, true) };
}

/** A visit's start and end, from the form. */
async function visitTimes(companyId: string, input: VisitInput) {
  const timeZone = serverTimeZone();
  if (input.isAllDay) {
    return { isAllDay: true, startsAt: zonedMoment(input.day, "00:00", timeZone), endsAt: zonedMoment(addDays(input.lastDay ?? input.day, 1), "00:00", timeZone) };
  }
  const startTime = input.startTime!;
  let endTime = input.endTime;
  if (!endTime) {
    const { defaultVisitLengthMinutes } = await businessSettings(companyId);
    // A default that runs past midnight stops at 11:59 pm: a visit is one day unless it's all day.
    endTime = timeOf(Math.min(minutesOf(startTime) + defaultVisitLengthMinutes, 24 * 60 - 1));
  }
  return { isAllDay: false, startsAt: zonedMoment(input.day, startTime, timeZone), endsAt: zonedMoment(input.day, endTime, timeZone) };
}

export interface Warning {
  kind: "overlap" | "dailyLimit" | "timeOff";
  message: string;
}

/**
 * What to warn about before saving a visit for someone: another of their
 * visits at the same time, a day over their limit, or their time off.
 * Cancelled visits never count; tentative ones do (they still take the time).
 */
async function warningsFor(tx: Tx, ctx: RequestContext, companyId: string, userId: string, exceptVisitId: string | null, times: { startsAt: Date; endsAt: Date; isAllDay: boolean }): Promise<Warning[]> {
  const timeZone = serverTimeZone();
  const days = daysCovered(times.startsAt, times.endsAt, timeZone);
  const rangeStart = zonedMoment(days[0]!, "00:00", timeZone);
  const rangeEnd = zonedMoment(addDays(days[days.length - 1]!, 1), "00:00", timeZone);
  const others = await tx.visit.findMany({
    where: { companyId, assignedUserId: userId, status: { not: "CANCELLED" }, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart }, ...(exceptVisitId ? { id: { not: exceptVisitId } } : {}) },
    select: visitSelect,
    orderBy: { startsAt: "asc" },
  });
  const warnings: Warning[] = [];

  // Clashes: an all-day visit doesn't clash with timed ones (it's the day's job, the times are loose).
  const clashes = others.filter((other) => !other.isAllDay && !times.isAllDay && overlaps(times.startsAt, times.endsAt, other.startsAt, other.endsAt));
  if (clashes.length) {
    const jobs = new Map((await scheduleJobs(ctx, { ids: clashes.map((clash) => clash.projectId) })).map((job) => [job.id, job.name]));
    for (const clash of clashes.slice(0, 3)) {
      const row = toRow(clash);
      warnings.push({ kind: "overlap", message: `Clashes with ${[row.label, jobs.get(clash.projectId) ?? "another job"].filter(Boolean).join(" at ")}, ${timeWords(row.startTime)} – ${timeWords(row.endTime)}.` });
    }
  }

  // Time off: approved only.
  const leave = await approvedLeave(companyId, { first: days[0]!, last: days[days.length - 1]! }, [userId]);
  const away = leave.filter((entry) => timeOffClashes(entry, times, timeZone));
  for (const entry of away.slice(0, 2)) warnings.push({ kind: "timeOff", message: awayWords(entry, days) });

  // A busy day: more than your limit on any day it covers (days you're away all day are already warned about).
  const { dailyVisitWarningLimit } = await userSettings(companyId, userId);
  if (dailyVisitWarningLimit) {
    for (const day of days) {
      const onDay = others.filter((other) => daysCovered(other.startsAt, other.endsAt, timeZone).includes(day)).length + 1;
      if (onDay > dailyVisitWarningLimit) warnings.push({ kind: "dailyLimit", message: `${dayWords(day)} will have ${onDay} visits (your limit is ${dailyVisitWarningLimit}).` });
    }
  }
  return warnings;
}

/** "You're away Wed 23 Dec (Annual leave)." */
function awayWords(entry: LeaveRow, days: string[]): string {
  const hit = days.find((day) => day >= entry.startsOn && day <= entry.endsOn) ?? entry.startsOn;
  const part = hit === entry.startsOn ? entry.firstDayPart : hit === entry.endsOn ? entry.lastDayPart : "WHOLE";
  const partText = part === "MORNING" ? " in the morning" : part === "AFTERNOON" ? " in the afternoon" : "";
  return `You're away ${dayWords(hit)}${partText} (${LEAVE_TYPE_WORDS[entry.type]}).`;
}

/** A job of this business that can take bookings: won, not finished, not archived. */
async function bookableJob(ctx: RequestContext, projectId: string): Promise<ScheduleJob> {
  const [job] = await scheduleJobs(ctx, { ids: [projectId] });
  if (!job) throw notFound("Job not found");
  if (job.archived) throw conflict("This job is archived: restore it to book visits");
  if (job.status === "QUOTING" || job.status === "NOT_WON") throw conflict("This is a quote's job: book visits once the quote is accepted");
  if (job.status === "COMPLETED") throw conflict("This job is finished: reopen it to book another visit");
  return job;
}

export type SaveResult = { saved: true; visit: VisitRow } | { saved: false; warnings: Warning[] };

export async function bookVisit(ctx: RequestContext, projectId: string, input: VisitInput): Promise<SaveResult> {
  const companyId = requireCompany(ctx);
  const job = await bookableJob(ctx, projectId);
  const times = await visitTimes(companyId, input);
  return db.$transaction(async (tx) => {
    if (!input.isWarningAcknowledged) {
      const warnings = await warningsFor(tx, ctx, companyId, ctx.userId, null, times);
      if (warnings.length) return { saved: false as const, warnings };
    }
    const record = await tx.visit.create({
      data: { companyId, projectId, ...times, isTentative: input.isTentative, label: input.label, notes: input.notes, assignedUserId: ctx.userId, createdByUserId: ctx.userId },
      select: visitSelect,
    });
    const visit = toRow(record);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Visit", entityId: visit.id, action: "booked", diff: { job: job.name, when: visit.when, tentative: visit.isTentative, label: visit.label } });
    return { saved: true as const, visit };
  });
}

async function ownVisit(tx: Tx, ctx: RequestContext, visitId: string) {
  const companyId = requireCompany(ctx);
  const record = await tx.visit.findFirst({ where: { id: visitId, companyId }, select: visitSelect });
  if (!record) throw notFound("Visit not found");
  // The job must still be one this business can see.
  const [job] = await scheduleJobs(ctx, { ids: [record.projectId] });
  if (!job) throw notFound("Visit not found");
  return { record, job, companyId };
}

/** Change a visit's day, times, label, notes or tentative. */
export async function changeVisit(ctx: RequestContext, visitId: string, input: VisitInput): Promise<SaveResult> {
  const companyId = requireCompany(ctx);
  const times = await visitTimes(companyId, input);
  return db.$transaction(async (tx) => {
    const { record, job } = await ownVisit(tx, ctx, visitId);
    if (job.archived) throw conflict("This job is archived: restore it to change visits");
    if (record.status === "CANCELLED") throw conflict("This visit was cancelled: book it again first");
    const before = toRow(record);
    const moved = before.startsAt.getTime() !== times.startsAt.getTime() || before.endsAt.getTime() !== times.endsAt.getTime() || before.isAllDay !== times.isAllDay;
    // Only a move is checked again: renaming or confirming doesn't re-warn.
    if (moved && !input.isWarningAcknowledged) {
      const warnings = await warningsFor(tx, ctx, companyId, record.assignedUserId ?? ctx.userId, visitId, times);
      if (warnings.length) return { saved: false as const, warnings };
    }
    const visit = toRow(await tx.visit.update({ where: { id: visitId }, data: { ...times, isTentative: input.isTentative, label: input.label, notes: input.notes }, select: visitSelect }));
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "Visit",
      entityId: visitId,
      action: moved ? "rescheduled" : before.isTentative && !visit.isTentative ? "confirmed" : "updated",
      diff: { job: job.name, before: before.when, when: visit.when, tentative: visit.isTentative },
    });
    return { saved: true as const, visit };
  });
}

/** "Builder confirmed Thursday": tentative → booked. Never re-warns (it was already counted). */
export async function confirmVisit(ctx: RequestContext, visitId: string) {
  return db.$transaction(async (tx) => {
    const { record, job, companyId } = await ownVisit(tx, ctx, visitId);
    if (!record.isTentative) return toRow(record);
    const visit = toRow(await tx.visit.update({ where: { id: visitId }, data: { isTentative: false }, select: visitSelect }));
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Visit", entityId: visitId, action: "confirmed", diff: { job: job.name, when: visit.when } });
    return visit;
  });
}

/**
 * Done, cancelled, or back to booked (undo). Marking the last open visit
 * done says so (askToComplete), so the job page can ask "Mark job complete?":
 * never done automatically.
 */
export async function setVisitStatus(ctx: RequestContext, visitId: string, status: VisitStatus) {
  return db.$transaction(async (tx) => {
    const { record, job, companyId } = await ownVisit(tx, ctx, visitId);
    if (job.archived) throw conflict("This job is archived: restore it to change visits");
    if (record.status === status) return { visit: toRow(record), askToComplete: false };
    if (status === "DONE" && localDay(record.startsAt) > localDay(new Date())) throw badRequest("This visit hasn't happened yet");
    const visit = toRow(
      await tx.visit.update({
        where: { id: visitId },
        data: { status, ...(status === "DONE" ? { doneAt: new Date(), doneByUserId: ctx.userId } : { doneAt: null, doneByUserId: null }) },
        select: visitSelect,
      }),
    );
    const action = status === "DONE" ? "done" : status === "CANCELLED" ? "cancelled" : record.status === "CANCELLED" ? "rebooked" : "reopened";
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Visit", entityId: visitId, action, diff: { job: job.name, when: visit.when } });
    const stillBooked = await tx.visit.count({ where: { projectId: record.projectId, status: "BOOKED" } });
    return { visit, askToComplete: status === "DONE" && stillBooked === 0 && job.status === "ACTIVE" };
  });
}

/** A job's visits, soonest first (cancelled ones last). */
export async function jobVisits(ctx: RequestContext, projectId: string): Promise<VisitRow[]> {
  const companyId = requireCompany(ctx);
  const [job] = await scheduleJobs(ctx, { ids: [projectId] });
  if (!job) throw notFound("Job not found");
  const rows = await db.visit.findMany({ where: { companyId, projectId }, select: visitSelect, orderBy: { startsAt: "asc" } });
  return rows.map(toRow).sort((first, second) => Number(first.status === "CANCELLED") - Number(second.status === "CANCELLED"));
}

// ─── The Schedule ───────────────────────────────────────────────────────

export interface AgendaVisit extends VisitRow {
  job: { id: string; name: string; jobNumber: string | null; suburb: string | null; clientName: string | null };
}

export interface AgendaDay {
  day: string;
  visits: AgendaVisit[];
  /** Your time off that day: "Away" with the part of the day. */
  away: { part: "WHOLE" | "MORNING" | "AFTERNOON" | "HOURS"; lastDayPart: "WHOLE" | "MORNING" | "AFTERNOON" | "HOURS"; type: string; startsOn: string; endsOn: string } | null;
}

/**
 * Visits from one day to another (both included), day by day, with your
 * time off. Cancelled visits are left out. The whole business's visits:
 * while solo that's yours; teams get a "just mine" view later.
 */
export async function agenda(ctx: RequestContext, range: { from: string; to: string }): Promise<AgendaDay[]> {
  const companyId = requireCompany(ctx);
  const timeZone = serverTimeZone();
  if (range.to < range.from) throw badRequest("The end is before the start");
  if (range.to > addDays(range.from, 93)) throw badRequest("Three months at a time at most");
  const rangeStart = zonedMoment(range.from, "00:00", timeZone);
  const rangeEnd = zonedMoment(addDays(range.to, 1), "00:00", timeZone);
  const records = await db.visit.findMany({
    where: { companyId, status: { not: "CANCELLED" }, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
    select: visitSelect,
    orderBy: [{ isAllDay: "desc" }, { startsAt: "asc" }],
  });
  const jobs = new Map((await scheduleJobs(ctx, { ids: records.map((record) => record.projectId) })).map((job) => [job.id, job]));
  const leave = await approvedLeave(companyId, { first: range.from, last: range.to }, [ctx.userId]);
  const days: AgendaDay[] = [];
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    const timeOff = leave.find((entry) => day >= entry.startsOn && day <= entry.endsOn);
    const part = timeOff ? (day === timeOff.startsOn ? timeOff.firstDayPart : day === timeOff.endsOn ? timeOff.lastDayPart : "WHOLE") : null;
    days.push({ day, visits: [], away: timeOff && part ? { part, lastDayPart: timeOff.lastDayPart, type: LEAVE_TYPE_WORDS[timeOff.type], startsOn: timeOff.startsOn, endsOn: timeOff.endsOn } : null });
  }
  const byDay = new Map(days.map((entry) => [entry.day, entry]));
  for (const record of records) {
    const job = jobs.get(record.projectId);
    // A job this business can no longer see (or archived) stays off the schedule.
    if (!job || job.archived) continue;
    const row = toRow(record);
    for (const day of daysCovered(record.startsAt, record.endsAt, timeZone)) {
      byDay.get(day)?.visits.push({ ...row, job: { id: job.id, name: job.name, jobNumber: job.jobNumber, suburb: job.suburb, clientName: job.clientName } });
    }
  }
  return days;
}

export interface ToBook {
  job: ScheduleJob;
  /** "none": won with nothing booked yet; "allDone": every visit done, but the job isn't finished. */
  reason: "none" | "allDone";
  /** The last done visit, for "Last visit Thu 3 Dec". */
  lastVisitDay: string | null;
}

/** Won jobs with no visit booked: never booked, or every visit done but the job not finished. */
export async function toBeBooked(ctx: RequestContext): Promise<ToBook[]> {
  const companyId = requireCompany(ctx);
  const jobs = await scheduleJobs(ctx, { active: true });
  if (!jobs.length) return [];
  const visits = await db.visit.groupBy({
    by: ["projectId", "status"],
    where: { companyId, projectId: { in: jobs.map((job) => job.id) }, status: { in: ["BOOKED", "DONE"] } },
    _max: { startsAt: true },
  });
  const booked = new Set(visits.filter((group) => group.status === "BOOKED").map((group) => group.projectId));
  const lastDone = new Map(visits.filter((group) => group.status === "DONE").map((group) => [group.projectId, group._max.startsAt]));
  return jobs
    .filter((job) => !booked.has(job.id))
    .map((job) => {
      const last = lastDone.get(job.id) ?? null;
      return { job, reason: last ? ("allDone" as const) : ("none" as const), lastVisitDay: last ? localDay(last) : null };
    });
}

/** For the job page and Home: today's visits for whoever's looking. */
export async function today(ctx: RequestContext) {
  const day = localDay(new Date());
  const [entry] = await agenda(ctx, { from: day, to: day });
  return entry!;
}

/**
 * Your booked visits that fall in some time off (after saving it), so the
 * screen can list them to move. Nothing is moved or cancelled.
 */
export async function visitsDuringTimeOff(ctx: RequestContext, timeOff: LeaveRow): Promise<AgendaVisit[]> {
  const companyId = requireCompany(ctx);
  const timeZone = serverTimeZone();
  const records = await db.visit.findMany({
    where: {
      companyId,
      assignedUserId: ctx.userId,
      status: "BOOKED",
      startsAt: { lt: zonedMoment(addDays(timeOff.endsOn, 1), "00:00", timeZone) },
      endsAt: { gt: zonedMoment(timeOff.startsOn, "00:00", timeZone) },
    },
    select: visitSelect,
    orderBy: { startsAt: "asc" },
  });
  const inside = records.filter((record) => timeOffClashes(timeOff, record, timeZone));
  const jobs = new Map((await scheduleJobs(ctx, { ids: inside.map((record) => record.projectId) })).map((job) => [job.id, job]));
  return inside.flatMap((record) => {
    const job = jobs.get(record.projectId);
    return job && !job.archived ? [{ ...toRow(record), job: { id: job.id, name: job.name, jobNumber: job.jobNumber, suburb: job.suburb, clientName: job.clientName } }] : [];
  });
}

