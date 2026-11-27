// When gear was last seen, worked out without the database (part 5,
// docs/assets-block.md "What part 5 built"), so it can be tested.
//   Not seen: nothing has moved or scanned it for the business's
//   notSeenDays (30 by default). Retired and lost gear don't count.
//   Still got it?: gear with you, or left on a job by you, that hasn't been
//   seen for stillGotItDays (14 by default) asks you on Home.
// Days are the server's local days (TZ), like the test & tag dates.

export const DEFAULT_NOT_SEEN_DAYS = 30;
export const DEFAULT_STILL_GOT_IT_DAYS = 14;

/** The day as "2026-11-28", in the server's timezone (the same as due.ts's today()). */
export function localDay(moment: Date, timeZone = process.env.TZ || "Australia/Melbourne") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
}

const today = () => localDay(new Date());

/** "2026-11-28" plus (or minus) some days. */
export function addDays(day: string, days: number): string {
  const moment = new Date(`${day}T00:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

/** The last time it was seen: the latest move or scan, or when it was added. */
export const lastSeenOf = (asset: { lastSeenAt: Date | null; createdAt: Date }) => asset.lastSeenAt ?? asset.createdAt;

/** Gear that can be "not seen": retired and lost gear already has its own state. */
export const tracksSightings = (status: string) => status !== "RETIRED" && status !== "LOST";

/**
 * The day it was last seen ("2026-10-03") when that's more than `days`
 * days ago, or null while it's been seen recently enough.
 */
export function notSeenSince(asset: { lastSeenAt: Date | null; createdAt: Date; status: string }, days: number, todayIs = today()): string | null {
  if (!tracksSightings(asset.status)) return null;
  const seenOn = localDay(lastSeenOf(asset));
  return seenOn < addDays(todayIs, -days) ? seenOn : null;
}

/** True on the one morning it crosses the line, so each email goes once. */
export function crossesToday(seenAt: Date, days: number, todayIs = today()): boolean {
  return addDays(localDay(seenAt), days + 1) === todayIs;
}

/**
 * A database filter that catches everything that might be "not seen"
 * (a day early, so timezones never miss one); notSeenSince decides exactly.
 */
export function seenBefore(days: number, todayIs = today()): Date {
  return new Date(`${addDays(todayIs, -days + 1)}T00:00:00Z`);
}

/** "3 weeks", "16 days", "2 months": how long since, for the Home card. */
export function howLong(seenOn: string, todayIs = today()): string {
  const days = Math.round((Date.parse(`${todayIs}T00:00:00Z`) - Date.parse(`${seenOn}T00:00:00Z`)) / 86_400_000);
  if (days >= 60) return `${Math.floor(days / 30)} months`;
  if (days >= 14 && days % 7 === 0) return `${days / 7} weeks`;
  return `${days} day${days === 1 ? "" : "s"}`;
}
