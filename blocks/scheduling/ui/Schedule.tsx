"use client";

// The Schedule (docs/scheduling-block.md): an agenda (Today, Tomorrow, then
// day by day, two weeks at a time) with your time off as one "Away" line,
// the week (WeekView.tsx: drag to move from tablet up), and "To be
// booked": won jobs with nothing booked. Tapping a visit opens
// its job, where it's changed; "Book" opens the job with the booking sheet.
import { useEffect, useState } from "react";
import { CalendarDays, Check, ChevronRight, Plane } from "lucide-react";
import { Button, EmptyState, PageHeader, Section, Segmented, Stack, api, cn, useAction } from "@grid/ui";
import { dayWords, timeWords } from "../words";
import type { AgendaDayJson, AgendaVisitJson, ToBookJson } from "./types";
import { WeekView, type WeekSettings } from "./WeekView";

type Tab = "agenda" | "week" | "tobook";
const PAGE_DAYS = 14;

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function Schedule({ initialDays, toBook, today, settings, canBook }: { initialDays: AgendaDayJson[]; toBook: ToBookJson[]; today: string; settings: WeekSettings; canBook: boolean }) {
  const [tab, setTab] = useState<Tab>("agenda");
  const [days, setDays] = useState(initialDays);
  const action = useAction();
  const visitCount = days.slice(0, 7).reduce((total, entry) => total + entry.visits.length, 0);

  useEffect(() => {
    const show = new URLSearchParams(window.location.search).get("show");
    if (show === "tobook" || show === "week") setTab(show);
    // Tablets and computers have room for the week; phones start on the agenda.
    else if (window.matchMedia("(min-width: 1024px)").matches) setTab("week");
  }, []);

  const loadMore = () =>
    action.run(async () => {
      const from = addDays(days[days.length - 1]!.day, 1);
      const more = await api<AgendaDayJson[]>(`/scheduling/agenda?from=${from}&to=${addDays(from, PAGE_DAYS - 1)}`);
      setDays((list) => [...list, ...more]);
    });

  return (
    <>
      <PageHeader title="Schedule" meta={`${visitCount} visit${visitCount === 1 ? "" : "s"} in the next 7 days${toBook.length ? ` · ${toBook.length} to be booked` : ""}`} />
      <Stack>
        <Segmented
          label="Show"
          value={tab}
          onChange={setTab}
          items={[
            { value: "agenda", label: "Agenda" },
            { value: "week", label: "Week" },
            { value: "tobook", label: "To be booked", count: toBook.length },
          ]}
        />
        {tab === "agenda" ? (
          <>
            <Agenda days={days} today={today} />
            <Button variant="outline" className="self-center" disabled={action.busy} onClick={() => void loadMore()}>
              {action.busy ? "Loading…" : "Show the next 2 weeks"}
            </Button>
          </>
        ) : tab === "week" ? (
          <WeekView today={today} settings={settings} canBook={canBook} />
        ) : (
          <ToBook rows={toBook} />
        )}
      </Stack>
    </>
  );
}

function dayHeading(day: string, today: string) {
  if (day === today) return `Today · ${dayWords(day)}`;
  if (day === addDays(today, 1)) return `Tomorrow · ${dayWords(day)}`;
  return dayWords(day);
}

function Agenda({ days, today }: { days: AgendaDayJson[]; today: string }) {
  const shown: { entry: AgendaDayJson; awayLine: string | null }[] = [];
  let lastAwayShown: string | null = null;
  for (const entry of days) {
    const isNear = entry.day === today || entry.day === addDays(today, 1);
    const away = entry.away;
    const awayKey = away ? `${away.startsOn}-${away.endsOn}` : null;
    // A run of days away reads as one line on its first day.
    const awayLine = away && awayKey !== lastAwayShown ? awayWords(away, entry.day) : null;
    if (away) lastAwayShown = awayKey;
    if (entry.visits.length || isNear || awayLine) shown.push({ entry, awayLine });
  }
  if (!shown.some(({ entry, awayLine }) => entry.visits.length || awayLine)) {
    return (
      <EmptyState title="Nothing booked yet">
        Book visits from a job's page, or from <a href="/schedule?show=tobook">To be booked</a>.
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {shown.map(({ entry, awayLine }) => (
        <Section key={entry.day} title={dayHeading(entry.day, today)} flush>
          <ul className="divide-y">
            {awayLine && (
              <li className="flex min-h-touch items-center gap-3 px-4 py-3 text-muted-foreground sm:px-6">
                <Plane className="size-5 shrink-0" aria-hidden />
                <span className="font-semibold">{awayLine}</span>
              </li>
            )}
            {entry.visits.map((visit) => (
              <VisitRow key={`${visit.id}-${entry.day}`} visit={visit} day={entry.day} />
            ))}
            {!entry.visits.length && !awayLine && <li className="px-4 py-3 text-muted-foreground sm:px-6">Nothing booked</li>}
          </ul>
        </Section>
      ))}
    </div>
  );
}

function awayWords(away: NonNullable<AgendaDayJson["away"]>, day: string) {
  if (away.startsOn === away.endsOn || (day === away.endsOn && day !== away.startsOn)) {
    const part = away.part === "MORNING" ? " (morning)" : away.part === "AFTERNOON" ? " (afternoon)" : "";
    return `Away${part}`;
  }
  // The first day can be from the afternoon, the last day until midday.
  const first = day > away.startsOn ? dayWords(day) : `${dayWords(away.startsOn)}${away.part === "AFTERNOON" ? " afternoon" : ""}`;
  return `Away ${first} – ${dayWords(away.endsOn)}${away.lastDayPart === "MORNING" ? " morning" : ""}`;
}

function VisitRow({ visit, day }: { visit: AgendaVisitJson; day: string }) {
  const multiDay = visit.day !== visit.lastDay;
  const time = visit.isAllDay ? (multiDay ? `Day ${Math.round((Date.parse(day) - Date.parse(visit.day)) / 86_400_000) + 1}` : "All day") : timeWords(visit.startTime);
  return (
    <li>
      <a href={`/jobs/${visit.job.id}`} className={cn("flex min-h-touch-lg items-center gap-3 px-4 py-3 hover:bg-muted sm:px-6", visit.isTentative && visit.status === "BOOKED" && "opacity-70")}>
        <span className="w-[4.75rem] shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums">{time}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{visit.job.name}</span>
            {visit.isTentative && visit.status === "BOOKED" && <span className="rounded-full border border-dashed px-2 py-0.5 text-xs font-semibold">Tentative</span>}
            {visit.status === "DONE" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                <Check className="size-3" aria-hidden />
                Done
              </span>
            )}
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {[visit.label, visit.job.suburb, visit.job.clientName, !visit.isAllDay ? `until ${timeWords(visit.endTime)}` : null].filter(Boolean).join(" · ")}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </a>
    </li>
  );
}

function ToBook({ rows }: { rows: ToBookJson[] }) {
  if (!rows.length) return <EmptyState title="Every won job has a visit booked">Jobs show here when they're won with nothing booked, or every visit's done but the job isn't finished.</EmptyState>;
  return (
    <Section flush>
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.job.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <a href={`/jobs/${row.job.id}`} className="flex min-w-0 flex-1 flex-col hover:underline">
              <span className="truncate font-semibold">{row.job.name}</span>
              <span className="truncate text-sm text-muted-foreground">
                {[row.reason === "none" ? "Not booked yet" : `Every visit done (last ${dayWords(row.lastVisitDay!)}): book another or finish the job`, row.job.suburb, row.job.clientName].filter(Boolean).join(" · ")}
              </span>
            </a>
            <Button asChild variant="outline">
              <a href={`/jobs/${row.job.id}?book=1`}>
                <CalendarDays aria-hidden />
                Book
              </a>
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
