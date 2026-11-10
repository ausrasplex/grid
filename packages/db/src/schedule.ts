// Schedule maths for backups (no imports, so it's unit-tested directly).

export interface Schedule {
  schedule: "off" | "daily" | "weekly";
  /** 0 = Sunday … 6 = Saturday. */
  day: number;
  /** "HH:MM" */
  time: string;
}

/**
 * The most recent moment a schedule was due, at or before `now`.
 * Daily 03:00 at 10:00 → today 03:00; at 02:00 → yesterday 03:00.
 */
export function lastDue(schedule: Schedule, now: Date): Date | null {
  if (schedule.schedule === "off") return null;
  const [hour, minute] = schedule.time.split(":").map(Number);
  for (let back = 0; back <= 7; back++) {
    const date = new Date(now);
    date.setDate(date.getDate() - back);
    date.setHours(hour!, minute!, 0, 0);
    if (date > now) continue;
    if (schedule.schedule === "weekly" && date.getDay() !== schedule.day) continue;
    return date;
  }
  return null;
}

/** The next time a schedule is due after `now`. */
export function nextDue(schedule: Schedule, now: Date): Date | null {
  if (schedule.schedule === "off") return null;
  const [hour, minute] = schedule.time.split(":").map(Number);
  for (let ahead = 0; ahead <= 8; ahead++) {
    const date = new Date(now);
    date.setDate(date.getDate() + ahead);
    date.setHours(hour!, minute!, 0, 0);
    if (date <= now) continue;
    if (schedule.schedule === "weekly" && date.getDay() !== schedule.day) continue;
    return date;
  }
  return null;
}
