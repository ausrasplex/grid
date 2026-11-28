// Dates and times for the Scheduling Block, with no database, so they can
// be tested. Visits are stored in UTC and shown in the server's timezone
// (TZ, from the Unraid template); time off is plain local dates.
// Days are "2026-12-03", times are "08:00" (24-hour), weeks start Monday.

export const DEFAULT_TIME_ZONE = "Australia/Melbourne";
export const serverTimeZone = () => process.env.TZ || DEFAULT_TIME_ZONE;

const MINUTE = 60_000;
const DAY = 86_400_000;

/** The local day ("2026-12-03") of a moment. */
export function localDay(moment: Date, timeZone = serverTimeZone()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
}

/** The local time ("08:30", 24-hour) of a moment. */
export function localTime(moment: Date, timeZone = serverTimeZone()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(moment);
  const hour = parts.find((part) => part.type === "hour")!.value;
  const minute = parts.find((part) => part.type === "minute")!.value;
  return `${hour}:${minute}`;
}

/** How far the timezone is ahead of UTC at that moment, in minutes (Melbourne: 600 or 660). */
function offsetMinutes(moment: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(moment);
  const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  const asIfUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return Math.round((asIfUtc - moment.getTime()) / MINUTE);
}

/**
 * The moment a local day and time happen ("2026-12-03", "08:00" in
 * Melbourne → 2026-12-02T21:00Z). Around a daylight-saving change, a time
 * that doesn't exist moves forward an hour; one that happens twice takes the first.
 */
export function zonedMoment(day: string, time = "00:00", timeZone = serverTimeZone()): Date {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  const asIfUtc = Date.UTC(year, month - 1, date, hour, minute);
  const firstGuess = asIfUtc - offsetMinutes(new Date(asIfUtc), timeZone) * MINUTE;
  const secondGuess = asIfUtc - offsetMinutes(new Date(firstGuess), timeZone) * MINUTE;
  return new Date(Math.min(firstGuess, secondGuess));
}

/** "2026-12-03" plus (or minus) days. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/** Monday of the day's week. */
export function weekStart(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

/** Days from first to last, both included. */
export function daysBetween(first: string, last: string): string[] {
  const days: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

/** True when two time ranges share any time (touching end to start doesn't count). */
export function overlaps(firstStart: Date, firstEnd: Date, secondStart: Date, secondEnd: Date): boolean {
  return firstStart < secondEnd && secondStart < firstEnd;
}

/**
 * The local days a visit covers. An end at exactly midnight doesn't cover
 * the next day (an all-day visit on Wed ends at Thu 00:00).
 */
export function daysCovered(startsAt: Date, endsAt: Date, timeZone = serverTimeZone()): string[] {
  const first = localDay(startsAt, timeZone);
  const last = localDay(new Date(Math.max(startsAt.getTime(), endsAt.getTime() - 1)), timeZone);
  return daysBetween(first, last);
}

// ─── Time off ───────────────────────────────────────────────────────────

export type DayPart = "WHOLE" | "MORNING" | "AFTERNOON" | "HOURS";

export interface TimeOffDays {
  startsOn: string;
  endsOn: string;
  firstDayPart: DayPart;
  lastDayPart: DayPart;
  /** Some hours on one day: "13:00" to "15:00". */
  fromTime?: string | null;
  toTime?: string | null;
}

/** The part of a day the time off takes: the first and last day can be part days. */
export function partOn(timeOff: TimeOffDays, day: string): DayPart | null {
  if (day < timeOff.startsOn || day > timeOff.endsOn) return null;
  if (day === timeOff.startsOn) return timeOff.firstDayPart;
  if (day === timeOff.endsOn) return timeOff.lastDayPart;
  return "WHOLE";
}

/** Morning is before midday, afternoon from midday. */
const MIDDAY = "12:00";

/**
 * Does the time off get in the way of a visit? A whole day always does; a
 * morning only if the visit starts before midday on that day, an afternoon
 * only if it runs past midday, some hours only if the visit overlaps them.
 * An all-day visit always clashes. Some hours without times (none yet)
 * counts as the whole day, to be safe.
 */
export function timeOffClashes(timeOff: TimeOffDays, visit: { startsAt: Date; endsAt: Date; isAllDay: boolean }, timeZone = serverTimeZone()): boolean {
  for (const day of daysCovered(visit.startsAt, visit.endsAt, timeZone)) {
    const part = partOn(timeOff, day);
    if (!part) continue;
    if (part === "WHOLE" || visit.isAllDay) return true;
    if (part === "HOURS") {
      if (!timeOff.fromTime || !timeOff.toTime) return true;
      if (overlaps(visit.startsAt, visit.endsAt, zonedMoment(day, timeOff.fromTime, timeZone), zonedMoment(day, timeOff.toTime, timeZone))) return true;
      continue;
    }
    const dayStart = zonedMoment(day, "00:00", timeZone);
    const midday = zonedMoment(day, MIDDAY, timeZone);
    const dayEnd = zonedMoment(addDays(day, 1), "00:00", timeZone);
    if (part === "MORNING" && overlaps(visit.startsAt, visit.endsAt, dayStart, midday)) return true;
    if (part === "AFTERNOON" && overlaps(visit.startsAt, visit.endsAt, midday, dayEnd)) return true;
  }
  return false;
}

/** A whole working day off: any part counts as taking the day for booking, apart from a half. */
export const blocksWholeDay = (timeOff: TimeOffDays, day: string) => partOn(timeOff, day) === "WHOLE";

/** How many days, counting a half day as a half: "10 days", "½ day", "2½ days"; some hours: "2 hours". */
export function timeOffLength(timeOff: TimeOffDays): string {
  if (timeOff.firstDayPart === "HOURS" && timeOff.fromTime && timeOff.toTime) {
    const minutes = minutesOf(timeOff.toTime) - minutesOf(timeOff.fromTime);
    if (minutes < 60) return `${minutes} minutes`;
    const hours = minutes / 60;
    const text = Number.isInteger(hours) ? String(hours) : hours % 1 === 0.5 ? `${Math.floor(hours) || ""}½` : hours.toFixed(2).replace(/0$/, "");
    return `${text} hour${hours === 1 ? "" : "s"}`;
  }
  let days = 0;
  for (const day of daysBetween(timeOff.startsOn, timeOff.endsOn)) {
    const part = partOn(timeOff, day);
    days += part === "MORNING" || part === "AFTERNOON" ? 0.5 : 1;
  }
  const whole = Math.floor(days);
  const text = `${whole || ""}${days % 1 ? "½" : ""}` || "0";
  return `${text} day${days <= 1 ? "" : "s"}`;
}

/** "13:30" → minutes since midnight. */
export const minutesOf = (time: string) => {
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  return hour * 60 + minute;
};

/** Minutes since midnight → "13:30". */
export const timeOf = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
