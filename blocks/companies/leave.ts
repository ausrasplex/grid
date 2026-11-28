// Leave and time off: one set of records for a person's time away
// (docs/roadmap.md "Leave"). The Scheduling Block saves a person's own time
// off here (approved straight away: the solo rule skips approval) and reads
// it to keep bookings off those days. The Leave Block (phase 7) will add
// requests, approval and the leave calendar on the same records, so time
// off entered now simply shows as approved leave when a team switches it on.
// Dates only, no balances.

import { z } from "zod";
import { badRequest, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db } from "@grid/db";

const MOD = "companies";

export const LEAVE_TYPES = ["ANNUAL", "PERSONAL", "COMPASSIONATE", "LONG_SERVICE", "PARENTAL", "COMMUNITY_SERVICE", "UNPAID", "RDO", "OTHER"] as const;
export type LeaveTypeId = (typeof LEAVE_TYPES)[number];
export const LEAVE_TYPE_WORDS: Record<LeaveTypeId, string> = {
  ANNUAL: "Annual",
  PERSONAL: "Personal/carer's",
  COMPASSIONATE: "Compassionate",
  LONG_SERVICE: "Long service",
  PARENTAL: "Parental",
  COMMUNITY_SERVICE: "Community service",
  UNPAID: "Unpaid",
  RDO: "RDO",
  OTHER: "Other",
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time");
/**
 * Time off you enter yourself: whole days, a morning or afternoon on the
 * first and last day, or some hours on one day (from and to).
 */
export const timeOffSchema = z
  .object({
    type: z.enum(LEAVE_TYPES).default("ANNUAL"),
    startsOn: day,
    endsOn: day,
    firstDayPart: z.enum(["WHOLE", "MORNING", "AFTERNOON", "HOURS"]).default("WHOLE"),
    lastDayPart: z.enum(["WHOLE", "MORNING", "AFTERNOON", "HOURS"]).default("WHOLE"),
    fromTime: time.nullish(),
    toTime: time.nullish(),
    note: z.string().trim().max(2000).nullish(),
  })
  .strict()
  .refine((input) => input.endsOn >= input.startsOn, { message: "The last day can't be before the first", path: ["endsOn"] })
  .refine((input) => input.startsOn === input.endsOn || (input.firstDayPart !== "HOURS" && input.lastDayPart !== "HOURS"), {
    message: "Some hours is for one day: make it a single day",
    path: ["firstDayPart"],
  })
  .refine((input) => input.firstDayPart !== "HOURS" || (input.fromTime && input.toTime), { message: "Pick the hours you're away", path: ["fromTime"] })
  .refine((input) => input.firstDayPart !== "HOURS" || !input.fromTime || !input.toTime || input.toTime > input.fromTime, { message: "Back after you leave", path: ["toTime"] });
export type TimeOffInput = z.infer<typeof timeOffSchema>;

export interface LeaveRow {
  id: string;
  userId: string;
  type: LeaveTypeId;
  /** "2026-12-22" */
  startsOn: string;
  endsOn: string;
  firstDayPart: "WHOLE" | "MORNING" | "AFTERNOON" | "HOURS";
  lastDayPart: "WHOLE" | "MORNING" | "AFTERNOON" | "HOURS";
  /** Some hours on one day: "13:00" to "15:00". */
  fromTime: string | null;
  toTime: string | null;
  note: string | null;
  status: "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED";
}

const asDay = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (dayText: string) => new Date(`${dayText}T00:00:00Z`);
const leaveSelect = { id: true, userId: true, type: true, startsOn: true, endsOn: true, firstDayPart: true, lastDayPart: true, fromTime: true, toTime: true, note: true, status: true } as const;
type LeaveRecord = {
  id: string;
  userId: string;
  type: LeaveTypeId;
  startsOn: Date;
  endsOn: Date;
  firstDayPart: LeaveRow["firstDayPart"];
  lastDayPart: LeaveRow["lastDayPart"];
  fromTime: string | null;
  toTime: string | null;
  note: string | null;
  status: LeaveRow["status"];
};
const toRow = (record: LeaveRecord): LeaveRow => ({ ...record, startsOn: asDay(record.startsOn), endsOn: asDay(record.endsOn) });

/**
 * Approved time away overlapping first…last (local days, both included),
 * for some people or everyone in the business. Pending, declined and
 * cancelled leave never blocks anything.
 */
export async function approvedLeave(companyId: string, range: { first: string; last: string }, userIds?: string[]): Promise<LeaveRow[]> {
  const rows = await db.leave.findMany({
    where: {
      companyId,
      status: "APPROVED",
      startsOn: { lte: asDate(range.last) },
      endsOn: { gte: asDate(range.first) },
      ...(userIds ? { userId: { in: userIds } } : {}),
    },
    select: leaveSelect,
    orderBy: { startsOn: "asc" },
  });
  return rows.map(toRow);
}

/** Your own time off, from a day on (default: everything not finished yet), soonest first. */
export async function myTimeOff(ctx: RequestContext, fromDay?: string): Promise<LeaveRow[]> {
  const companyId = requireCompany(ctx);
  const rows = await db.leave.findMany({
    where: { companyId, userId: ctx.userId, status: { in: ["APPROVED", "PENDING"] }, ...(fromDay ? { endsOn: { gte: asDate(fromDay) } } : {}) },
    select: leaveSelect,
    orderBy: { startsOn: "asc" },
  });
  return rows.map(toRow);
}

/** Add or change your own time off. Saved as approved (no approval step while there's no Leave Block). */
export async function saveTimeOff(ctx: RequestContext, id: string | null, input: TimeOffInput): Promise<LeaveRow> {
  const companyId = requireCompany(ctx);
  const sameDay = input.startsOn === input.endsOn;
  const hours = sameDay && input.firstDayPart === "HOURS" ? { fromTime: input.fromTime!, toTime: input.toTime! } : { fromTime: null, toTime: null };
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const data = {
    type: input.type,
    startsOn: asDate(input.startsOn),
    endsOn: asDate(input.endsOn),
    firstDayPart: input.firstDayPart,
    // One day: one part.
    lastDayPart: sameDay ? input.firstDayPart : input.lastDayPart,
    ...hours,
    // The Leave Block's "hours" is the length; the times say which hours.
    firstDayHours: hours.fromTime ? (minutes(hours.toTime!) - minutes(hours.fromTime)) / 60 : null,
    lastDayHours: null,
    note: input.note || null,
  };
  return db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.leave.findFirst({ where: { id, companyId, userId: ctx.userId }, select: { startsOn: true, endsOn: true, status: true } });
      if (!before) throw notFound("Time off not found");
      if (before.status !== "APPROVED") throw badRequest("Only approved time off can be changed here");
      const row = await tx.leave.update({ where: { id }, data, select: leaveSelect });
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Leave", entityId: id, action: "updated", diff: { from: asDay(before.startsOn), to: asDay(before.endsOn), startsOn: input.startsOn, endsOn: input.endsOn } });
      return toRow(row);
    }
    const row = await tx.leave.create({ data: { ...data, companyId, userId: ctx.userId, status: "APPROVED", createdByUserId: ctx.userId }, select: leaveSelect });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Leave", entityId: row.id, action: "created", diff: { startsOn: input.startsOn, endsOn: input.endsOn, type: input.type } });
    return toRow(row);
  });
}

/** Remove your own time off (it was only a planning aid). */
export async function deleteTimeOff(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const before = await tx.leave.findFirst({ where: { id, companyId, userId: ctx.userId }, select: { startsOn: true, endsOn: true } });
    if (!before) throw notFound("Time off not found");
    await tx.leave.delete({ where: { id } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Leave", entityId: id, action: "deleted", diff: { startsOn: asDay(before.startsOn), endsOn: asDay(before.endsOn) } });
  });
  return { ok: true };
}
