// Ticket and licence types, and how close one is to running out. No server
// code here, so the screens and the tests use it too.

export interface TicketType {
  id: string;
  name: string;
  /** Who usually issues it, as a hint. */
  issuerHint?: string;
}

/** Common Australian tickets and licences, in the order people look for them. */
export const TICKET_TYPES: TicketType[] = [
  { id: "white-card", name: "White Card (construction induction)", issuerHint: "e.g. WorkSafe Victoria, SafeWork NSW" },
  { id: "electrical-licence", name: "Electrical licence", issuerHint: "e.g. Energy Safe Victoria" },
  { id: "electrical-contractor", name: "Electrical contractor licence (REC)", issuerHint: "e.g. Energy Safe Victoria" },
  { id: "ewp", name: "EWP licence (yellow card)", issuerHint: "e.g. EWPA" },
  { id: "high-risk-work", name: "High risk work licence", issuerHint: "e.g. WorkSafe Victoria" },
  { id: "working-at-heights", name: "Working at heights" },
  { id: "confined-space", name: "Confined space" },
  { id: "low-voltage-rescue", name: "Low voltage rescue (LVR)" },
  { id: "cpr", name: "CPR" },
  { id: "first-aid", name: "First aid" },
  { id: "test-and-tag", name: "Test & tag" },
  { id: "asbestos-awareness", name: "Asbestos awareness" },
  { id: "drivers-licence", name: "Driver's licence", issuerHint: "e.g. VicRoads" },
  { id: "working-with-children", name: "Working with Children Check" },
  { id: "other", name: "Other" },
];

export const ticketTypeName = (id: string) => TICKET_TYPES.find((type) => type.id === id)?.name ?? "Ticket";

/** "Expiring soon" from this many days before. */
export const SOON_DAYS = 60;
/** Reminder emails go this many days before (0 = on the day). */
export const REMIND_AT = [60, 30, 7, 0];

export type TicketStatus = "no-expiry" | "current" | "soon" | "expired";

/** Whole days from "today" to "expires" (both "YYYY-MM-DD"); negative once it's past. */
export function daysUntil(expires: string, today: string): number {
  return Math.round((Date.parse(`${expires}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Where a ticket stands. It's still good on its expiry day. */
export function ticketStatus(expires: string | null, today: string): { status: TicketStatus; daysLeft: number | null } {
  if (!expires) return { status: "no-expiry", daysLeft: null };
  const daysLeft = daysUntil(expires, today);
  return { status: daysLeft < 0 ? "expired" : daysLeft <= SOON_DAYS ? "soon" : "current", daysLeft };
}

/**
 * Which reminder is due now (60, 30, 7 or 0 days before), or null. Each is
 * sent once: "lastSent" is the last one that went. A ticket that's already
 * past gets the "on the day" one if it never had it.
 */
export function reminderDue(daysLeft: number, lastSent: number | null): number | null {
  const reached = REMIND_AT.filter((days) => daysLeft <= days);
  if (!reached.length) return null;
  const due = Math.min(...reached);
  return lastSent === null || lastSent > due ? due : null;
}

/** "Expires in 23 days", "Expires tomorrow", "Expired 3 days ago". */
export function expiryWords(daysLeft: number | null): string {
  if (daysLeft === null) return "Doesn't expire";
  if (daysLeft === 0) return "Expires today";
  if (daysLeft === 1) return "Expires tomorrow";
  if (daysLeft > 1) return `Expires in ${daysLeft} days`;
  if (daysLeft === -1) return "Expired yesterday";
  return `Expired ${-daysLeft} days ago`;
}

/** Today's date ("YYYY-MM-DD") where the server is (TZ). */
export function todayHere(timeZone = process.env.TZ || "Australia/Melbourne"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
