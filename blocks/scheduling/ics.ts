// The phone calendar feed's file (iCalendar, RFC 5545), with no database,
// so it can be tested. Times are written in UTC ("Z"); all-day events as
// dates, with the end date the day after (as calendars expect).

export interface IcsEvent {
  /** Stays the same for the same visit, so calendars update rather than duplicate. */
  uid: string;
  summary: string;
  /** Timed: start and end moments. */
  startsAt?: Date;
  endsAt?: Date;
  /** All day: first and last day, both included ("2026-12-02"). */
  firstDay?: string;
  lastDay?: string;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  status?: "CONFIRMED" | "TENTATIVE";
  /** Shows as busy (a visit) or free (time off). */
  busy?: boolean;
  updatedAt?: Date;
}

/** Commas, semicolons, backslashes and new lines need escaping in text. */
export function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines over 75 bytes are folded: a line break, then a space, then the rest (without splitting a character). */
export function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let limit = 75;
  for (const character of line) {
    if (encoder.encode(current + character).length > limit) {
      parts.push(current);
      current = "";
      limit = 74; // the leading space takes one
    }
    current += character;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** 2026-12-02T21:00:00Z → "20261202T210000Z". */
const utcStamp = (moment: Date) => moment.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** "2026-12-02" → "20261202". */
const dateStamp = (day: string) => day.replace(/-/g, "");
const dayAfter = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function calendarFile(calendarName: string, events: IcsEvent[], now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Grid//Scheduling//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(calendarName)}`, "X-PUBLISHED-TTL:PT1H", "REFRESH-INTERVAL;VALUE=DURATION:PT1H"];
  for (const event of events) {
    lines.push("BEGIN:VEVENT", `UID:${event.uid}`, `DTSTAMP:${utcStamp(event.updatedAt ?? now)}`);
    if (event.firstDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(event.firstDay)}`, `DTEND;VALUE=DATE:${dateStamp(dayAfter(event.lastDay ?? event.firstDay))}`);
    } else {
      lines.push(`DTSTART:${utcStamp(event.startsAt!)}`, `DTEND:${utcStamp(event.endsAt!)}`);
    }
    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    if (event.status) lines.push(`STATUS:${event.status}`);
    lines.push(`TRANSP:${event.busy === false ? "TRANSPARENT" : "OPAQUE"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
