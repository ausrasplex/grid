// When an asset's routines are next due (docs/assets-block.md §4). Plain
// functions, tested. Like Docket's service plans: a routine every so many
// months counts from the latest check that covered it; for one that must
// be passed (test & tag) only a pass counts. A booking, once made, is the
// date that shows until it's logged or called off.
//   ok       due later than a month away
//   soon     due within 30 days, or never done yet
//   overdue  past its due date
//   none     no interval set

export type DueTone = "ok" | "soon" | "overdue" | "none";

export interface Due {
  tone: DueTone;
  /** "Due 3 Mar 2027", "Due in 12 days", "Overdue · 4 days late", "Not done yet". */
  text: string;
  /** "2027-03-03", or null when there's no date. */
  dueOn: string | null;
}

export interface RoutineLike {
  id: string;
  everyMonths: number | null;
  mustPass: boolean;
}

export interface CheckLike {
  /** "2026-11-26". */
  date: string;
  routineIds: string[];
  result: "PASS" | "FAIL";
}

/** How close "soon" is. */
export const SOON_DAYS = 30;

const DAY = 86_400_000;
const toTime = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** "3 Mar 2027". */
export function dayText(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** The day so many months on, kept to the end of a shorter month (31 Jan + 1 month = 28 Feb). */
export function addMonths(day: string, months: number) {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date, last));
  return target.toISOString().slice(0, 10);
}

/** Today's date ("2026-11-26") where the server is (TZ, as Wallet does). */
export function today(now = new Date(), timeZone = process.env.TZ || "Australia/Melbourne") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The latest check covering a routine that counts (a pass, for a must-pass routine). */
export function lastDone(routine: RoutineLike, checks: CheckLike[]): string | null {
  let latest: string | null = null;
  for (const check of checks) {
    if (!check.routineIds.includes(routine.id)) continue;
    if (routine.mustPass && check.result !== "PASS") continue;
    if (!latest || check.date > latest) latest = check.date;
  }
  return latest;
}

/** When a routine is next due, and how it reads. */
export function routineDue(routine: RoutineLike, checks: CheckLike[], todayIs = today()): Due {
  if (!routine.everyMonths) return { tone: "none", text: "No interval set", dueOn: null };
  const last = lastDone(routine, checks);
  if (!last) return { tone: "soon", text: routine.mustPass ? "Not done yet" : "Not logged yet", dueOn: null };
  const dueOn = addMonths(last, routine.everyMonths);
  const days = Math.round((toTime(dueOn) - toTime(todayIs)) / DAY);
  if (days < 0) return { tone: "overdue", text: `Overdue · ${-days} day${days === -1 ? "" : "s"} late`, dueOn };
  if (days === 0) return { tone: "soon", text: "Due today", dueOn };
  if (days <= SOON_DAYS) return { tone: "soon", text: `Due in ${days} day${days === 1 ? "" : "s"}`, dueOn };
  return { tone: "ok", text: `Due ${dayText(dueOn)}`, dueOn };
}

/**
 * The soonest due date among the must-pass routines, kept on the asset.
 * Routines never passed have no date, so new gear isn't blocked the moment
 * it's added; it shows "Not done yet" instead.
 */
export function nextInspectionDue(routines: RoutineLike[], checks: CheckLike[]): string | null {
  let soonest: string | null = null;
  for (const routine of routines) {
    if (!routine.mustPass || !routine.everyMonths) continue;
    const last = lastDone(routine, checks);
    if (!last) continue;
    const due = addMonths(last, routine.everyMonths);
    if (!soonest || due < soonest) soonest = due;
  }
  return soonest;
}

/** Past due: the day after the due date. */
export const isOverdue = (dueOn: string | null, todayIs = today()) => !!dueOn && dueOn < todayIs;

/** The most urgent of several, for a list card's one chip. */
export function mostUrgent(dues: Due[]): Due | null {
  const rank: Record<DueTone, number> = { overdue: 0, soon: 1, ok: 2, none: 3 };
  const sorted = dues.filter((due) => due.tone === "overdue" || due.tone === "soon").sort((a, b) => rank[a.tone] - rank[b.tone] || (a.dueOn ?? "9").localeCompare(b.dueOn ?? "9"));
  return sorted[0] ?? null;
}

/**
 * The test & tag colour for a date (AS/NZS 3760 colour rotation, the one
 * most Australian sites use): Red Dec–Feb, Green Mar–May, Blue Jun–Aug,
 * Yellow Sep–Nov.
 */
export function tagColourFor(day: string): "RED" | "GREEN" | "BLUE" | "YELLOW" {
  const month = Number(day.slice(5, 7));
  if (month === 12 || month <= 2) return "RED";
  if (month <= 5) return "GREEN";
  if (month <= 8) return "BLUE";
  return "YELLOW";
}

export const TAG_COLOURS = ["RED", "GREEN", "BLUE", "YELLOW"] as const;

/** A routine that's test & tag, which shows the tag colour in the log. */
export const isTestAndTag = (name: string) => /test\s*(&|and|n)\s*tag/i.test(name);
