// How days and times read, for warnings and the schedule (no database, no
// "use client": the server and the screens both use these). en-AU.

/** "Thu 3 Dec" from "2026-12-03" (with the year when it isn't this year's). */
export function dayWords(day: string, thisYear = new Date().getFullYear()): string {
  const date = new Date(`${day}T00:00:00Z`);
  // Built from parts: browsers and Node differ on the comma after the weekday.
  const parts = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  const year = date.getUTCFullYear() === thisYear ? "" : ` ${part("year")}`;
  return `${part("weekday")} ${part("day")} ${part("month")}${year}`;
}

/** "8:00 am", "12:30 pm" from "08:00", "12:30". */
export function timeWords(time: string): string {
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  const suffix = hour < 12 ? "am" : "pm";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** "8:00 am – 10:00 am", "All day", "All day, Wed 2 – Fri 4 Dec". */
export function whenWords(visit: { isAllDay: boolean; day: string; lastDay: string; startTime: string; endTime: string }, withDay = false): string {
  if (visit.isAllDay) {
    if (visit.lastDay !== visit.day) return `All day, ${dayWords(visit.day)} – ${dayWords(visit.lastDay)}`;
    return withDay ? `${dayWords(visit.day)}, all day` : "All day";
  }
  const times = `${timeWords(visit.startTime)} – ${timeWords(visit.endTime)}`;
  return withDay ? `${dayWords(visit.day)}, ${times}` : times;
}

/** "2 hours", "1½ hours", "45 minutes". */
export function lengthWords(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  const whole = Math.floor(hours);
  const text = hours % 1 === 0.5 ? `${whole}½` : Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${text} hour${hours === 1 ? "" : "s"}`;
}
