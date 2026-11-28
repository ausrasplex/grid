// What the scheduling screens get from the API (dates as text). No "use
// client": server pages pass these straight through.

export interface VisitJson {
  id: string;
  projectId: string;
  label: string | null;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  isTentative: boolean;
  status: "BOOKED" | "DONE" | "CANCELLED";
  notes: string | null;
  assignedUserId: string | null;
  doneAt: string | null;
  /** "2026-12-03", in the server's timezone. */
  day: string;
  lastDay: string;
  /** "08:00". */
  startTime: string;
  endTime: string;
  /** "Thu 3 Dec, 8:00 am – 10:00 am". */
  when: string;
}

export interface AgendaVisitJson extends VisitJson {
  job: { id: string; name: string; jobNumber: string | null; suburb: string | null; clientName: string | null };
}

export interface AgendaDayJson {
  day: string;
  visits: AgendaVisitJson[];
  away: { part: "WHOLE" | "MORNING" | "AFTERNOON" | "HOURS"; lastDayPart: "WHOLE" | "MORNING" | "AFTERNOON" | "HOURS"; type: string; startsOn: string; endsOn: string } | null;
}

export interface ToBookJson {
  job: { id: string; name: string; jobNumber: string | null; suburb: string | null; clientName: string | null; siteName: string };
  reason: "none" | "allDone";
  lastVisitDay: string | null;
}

export interface LeaveJson {
  id: string;
  type: string;
  startsOn: string;
  endsOn: string;
  firstDayPart: "WHOLE" | "MORNING" | "AFTERNOON" | "HOURS";
  lastDayPart: "WHOLE" | "MORNING" | "AFTERNOON" | "HOURS";
  note: string | null;
  status: string;
}

export interface FeedJson {
  address: string | null;
  subscribe: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
}

/** Turns a server value (Dates inside) into what a client component gets. */
export const json = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;
