"use client";

// The week view (docs/scheduling-block.md "Week view"): Monday to Sunday.
// From tablet up it's a time grid: drag a visit to another time or day
// (snaps to 15 minutes), tap one to change it. On a phone it's the seven
// days as a list (dragging on a small screen is fiddly): tap to change.
// Each day says when it's at or over your busy day warning. Time off shows
// as Away blocks (a whole day in the all-day row; a morning, afternoon or
// some hours in the grid): tap one to change it. A day's ⋯ menu blocks it out.
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plane,
  TriangleAlert,
} from "lucide-react";
import {
  Alert,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  api,
  cn,
  useAction,
} from "@grid/ui";
import { dayWords, timeWords } from "../words";
import { TimeOffSheet } from "./SchedulingSettings";
import { VisitSheet, type Warning } from "./VisitSheet";
import type {
  AgendaDayJson,
  AgendaVisitJson,
  LeaveJson,
  VisitJson,
} from "./types";

const HOUR_HEIGHT = 48;
const SNAP_MINUTES = 15;
const DAY_MS = 86_400_000;

const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
const mondayOf = (day: string) =>
  addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
const minutesOf = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const timeOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const shortWeekday = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", {
    weekday: "short",
    timeZone: "UTC",
  });
const dayNumber = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDate();

export interface WeekSettings {
  dayStartsAt: string;
  dayEndsAt: string;
  dailyVisitWarningLimit: number | null;
  defaultVisitLengthMinutes: number;
}

type SaveResult =
  | { saved: true; visit: VisitJson }
  | { saved: false; warnings: Warning[] };

/** A move waiting on "Move anyway" after a warning. */
interface PendingMove {
  visit: AgendaVisitJson;
  body: Record<string, unknown>;
  warnings: Warning[];
}

export function WeekView({
  today,
  settings,
  canBook,
}: {
  today: string;
  settings: WeekSettings;
  canBook: boolean;
}) {
  const [monday, setMonday] = useState(mondayOf(today));
  const [days, setDays] = useState<AgendaDayJson[] | null>(null);
  const [editing, setEditing] = useState<AgendaVisitJson | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [blockingOut, setBlockingOut] = useState<string | null>(null);
  const [editingAway, setEditingAway] = useState<LeaveJson | null>(null);
  const action = useAction();

  // Booked visits open the change sheet; done ones (or without booking rights) open their job.
  const open = (visit: AgendaVisitJson) => {
    if (canBook && visit.status === "BOOKED") setEditing(visit);
    else window.location.href = `/jobs/${visit.job.id}`;
  };

  const load = useCallback(
    () =>
      action.run(async () => {
        setDays(
          await api<AgendaDayJson[]>(
            `/scheduling/agenda?from=${monday}&to=${addDays(monday, 6)}`,
          ),
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monday],
  );
  useEffect(() => {
    void load();
  }, [load]);

  /** Save a move; a clash, busy day or time off asks first. */
  const move = (
    visit: AgendaVisitJson,
    change: {
      day: string;
      startTime?: string;
      endTime?: string;
      lastDay?: string;
    },
    isWarningAcknowledged = false,
  ) =>
    action.run(async () => {
      const body = {
        day: change.day,
        isAllDay: visit.isAllDay,
        ...(visit.isAllDay
          ? { lastDay: change.lastDay }
          : { startTime: change.startTime, endTime: change.endTime }),
        isTentative: visit.isTentative,
        label: visit.label,
        notes: visit.notes,
        isWarningAcknowledged,
      };
      const result = await api<SaveResult>(`/scheduling/visits/${visit.id}`, {
        method: "PUT",
        body,
      });
      if (!result.saved)
        return setPending({ visit, body, warnings: result.warnings });
      setPending(null);
      await load();
    });

  const weekLabel = `${dayWords(monday)} – ${dayWords(addDays(monday, 6))}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Last week"
          onClick={() => setMonday(addDays(monday, -7))}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next week"
          onClick={() => setMonday(addDays(monday, 7))}
        >
          <ChevronRight />
        </Button>
        <span className="min-w-0 flex-1 truncate font-semibold">
          {weekLabel}
        </span>
        {monday !== mondayOf(today) && (
          <Button variant="ghost" onClick={() => setMonday(mondayOf(today))}>
            This week
          </Button>
        )}
      </div>
      <Alert variant="error">{action.error}</Alert>
      {!days ? (
        <p className="py-8 text-center text-muted-foreground">Loading…</p>
      ) : (
        <>
          <WeekGrid
            days={days}
            today={today}
            settings={settings}
            canBook={canBook}
            onOpen={open}
            onMove={(visit, change) => void move(visit, change)}
            onBlockOut={setBlockingOut}
            onAway={setEditingAway}
          />
          <WeekList
            days={days}
            today={today}
            settings={settings}
            onOpen={open}
            onBlockOut={setBlockingOut}
            onAway={setEditingAway}
          />
        </>
      )}

      {editing && (
        <VisitSheet
          open
          onOpenChange={(isOpen) => !isOpen && setEditing(null)}
          jobId={editing.job.id}
          jobName={editing.job.name}
          visit={editing}
          today={today}
          defaultLengthMinutes={settings.defaultVisitLengthMinutes}
          onSaved={() => void load()}
          jobLink
        />
      )}

      <Sheet
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <SheetContent
          desktop="dialog"
          title="Move this visit?"
          description={
            pending
              ? `${pending.visit.job.name}${pending.visit.label ? `, ${pending.visit.label}` : ""}`
              : undefined
          }
          footer={
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPending(null)}
              >
                Leave it
              </Button>
              <Button
                className="flex-1"
                disabled={action.busy}
                onClick={() =>
                  pending &&
                  void move(
                    pending.visit,
                    pending.body as { day: string },
                    true,
                  ).then(() => undefined)
                }
              >
                Move anyway
              </Button>
            </div>
          }
        >
          <div
            role="alert"
            className="mx-2 flex flex-col gap-2 rounded-lg bg-warning/15 p-3"
          >
            {pending?.warnings.map((warning) => (
              <p
                key={warning.message}
                className="flex items-start gap-2 text-sm font-semibold"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {warning.message}
              </p>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {editingAway && (
        <TimeOffSheet
          entry={editingAway}
          today={editingAway.startsOn}
          onClose={() => setEditingAway(null)}
          onSaved={() => void load()}
          onDeleted={() => void load()}
        />
      )}

      {blockingOut && (
        <TimeOffSheet
          entry={null}
          today={blockingOut}
          onClose={() => setBlockingOut(null)}
          onSaved={() => void load()}
          onDeleted={() => void load()}
        />
      )}
    </div>
  );
}

/** "Full" at the limit, "Over" past it. */
function busyMarker(count: number, limit: number | null) {
  if (!limit || count < limit) return null;
  return count === limit
    ? { text: "Full", tone: "bg-muted text-foreground" }
    : { text: `Over (${count})`, tone: "bg-warning/25 text-foreground" };
}

/** How many visits count towards the busy day warning: everything but cancelled (already left out). */
const dayCount = (day: AgendaDayJson) => day.visits.length;

function DayMenu({
  day,
  onBlockOut,
}: {
  day: string;
  onBlockOut: (day: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`More for ${dayWords(day)}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onBlockOut(day)}>
          Block out this day
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Tablet and desktop: the time grid ──────────────────────────────────

/** Something in a day's column: a visit, or time away. Minutes since midnight. */
type GridItem = { start: number; end: number } & (
  | { visit: AgendaVisitJson; away?: undefined }
  | { away: NonNullable<AgendaDayJson["away"]>; visit?: undefined }
);

/** Side-by-side lanes for things that overlap on one day. */
function lanes(items: GridItem[]) {
  const sorted = [...items].sort((first, second) => first.start - second.start);
  const laneEnds: number[] = [];
  const placed = sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = item.end;
    return { item, lane };
  });
  return { placed, count: Math.max(laneEnds.length, 1) };
}

/** "Away", "Away · 1:00 pm – 3:00 pm": the label on an Away block. */
function awayLabel(away: NonNullable<AgendaDayJson["away"]>) {
  if (away.part === "HOURS" && away.fromTime && away.toTime)
    return `${timeWords(away.fromTime)} – ${timeWords(away.toTime)}`;
  if (away.part === "MORNING") return "Morning";
  if (away.part === "AFTERNOON") return "Afternoon";
  return away.typeWords;
}

/** Time off as a block: grey and dashed so it's never mistaken for a job. Tap to change it. */
function AwayBlock({
  away,
  onAway,
  style,
  compact = false,
}: {
  away: NonNullable<AgendaDayJson["away"]>;
  onAway: (entry: LeaveJson) => void;
  style?: React.CSSProperties;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onAway(away)}
      style={style}
      title={`Away (${away.typeWords}). Tap to change.`}
      className="flex flex-col overflow-hidden rounded-md border border-dashed border-muted-foreground/50 bg-muted px-1.5 py-1 text-left text-xs leading-tight text-muted-foreground hover:bg-muted/80"
    >
      <span className="flex items-center gap-1 font-semibold text-foreground">
        <Plane className="size-3 shrink-0" aria-hidden />
        Away
      </span>
      {!compact && <span className="truncate">{awayLabel(away)}</span>}
    </button>
  );
}

interface Drag {
  visit: AgendaVisitJson;
  pointerId: number;
  startX: number;
  startY: number;
  dayIndex: number;
  /** Where it would land now. */
  dayOffset: number;
  minuteOffset: number;
  moved: boolean;
  /** One day's width in pixels, when the drag started. */
  columnWidth: number;
}

function WeekGrid({
  days,
  today,
  settings,
  canBook,
  onOpen,
  onMove,
  onBlockOut,
  onAway,
}: {
  days: AgendaDayJson[];
  today: string;
  settings: WeekSettings;
  canBook: boolean;
  onOpen: (visit: AgendaVisitJson) => void;
  onMove: (
    visit: AgendaVisitJson,
    change: {
      day: string;
      startTime?: string;
      endTime?: string;
      lastDay?: string;
    },
  ) => void;
  onBlockOut: (day: string) => void;
  onAway: (entry: LeaveJson) => void;
}) {
  const columnsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  // The hours shown: the working day, stretched to fit anything outside it (visits, or hours away).
  const timed = days.flatMap((day) =>
    day.visits
      .filter((visit) => !visit.isAllDay)
      .map((visit) => ({
        start: minutesOf(visit.startTime),
        end: minutesOf(visit.endTime) || 24 * 60,
      })),
  );
  const awayHours = days.flatMap((day) =>
    day.away?.part === "HOURS" && day.away.fromTime && day.away.toTime
      ? [
          {
            start: minutesOf(day.away.fromTime),
            end: minutesOf(day.away.toTime),
          },
        ]
      : [],
  );
  const firstHour = Math.floor(
    Math.min(
      minutesOf(settings.dayStartsAt),
      ...[...timed, ...awayHours].map((range) => range.start),
    ) / 60,
  );
  const lastHour = Math.ceil(
    Math.max(
      minutesOf(settings.dayEndsAt),
      ...[...timed, ...awayHours].map((range) => range.end),
    ) / 60,
  );
  const hours = Array.from(
    { length: Math.max(lastHour - firstHour, 1) },
    (_, index) => firstHour + index,
  );
  const gridTop = firstHour * 60;
  const gridBottom = lastHour * 60;
  const wholeDayAway = (day: AgendaDayJson) =>
    day.away?.part === "WHOLE" ||
    (day.away?.part === "HOURS" && (!day.away.fromTime || !day.away.toTime));
  const hasAllDay = days.some(
    (day) => day.visits.some((visit) => visit.isAllDay) || wholeDayAway(day),
  );

  /** A morning, afternoon or some hours away, as a range in the grid. */
  const awayRange = (away: NonNullable<AgendaDayJson["away"]>) =>
    away.part === "MORNING"
      ? { start: gridTop, end: Math.max(12 * 60, gridTop + 30) }
      : away.part === "AFTERNOON"
        ? { start: Math.min(12 * 60, gridBottom - 30), end: gridBottom }
        : { start: minutesOf(away.fromTime!), end: minutesOf(away.toTime!) };

  const startDrag = (
    event: React.PointerEvent,
    visit: AgendaVisitJson,
    dayIndex: number,
  ) => {
    if (!canBook || visit.status !== "BOOKED") return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const columnWidth =
      (columnsRef.current?.getBoundingClientRect().width ?? 700) / 7;
    setDrag({
      visit,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dayIndex,
      dayOffset: 0,
      minuteOffset: 0,
      moved: false,
      columnWidth,
    });
  };
  const moveDrag = (event: React.PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { columnWidth } = drag;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const moved = drag.moved || Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6;
    const dayOffset = Math.max(
      -drag.dayIndex,
      Math.min(6 - drag.dayIndex, Math.round(deltaX / columnWidth)),
    );
    const minuteOffset = drag.visit.isAllDay
      ? 0
      : Math.round(((deltaY / HOUR_HEIGHT) * 60) / SNAP_MINUTES) * SNAP_MINUTES;
    setDrag({ ...drag, dayOffset, minuteOffset, moved });
  };
  const endDrag = (event: React.PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { visit, dayOffset, minuteOffset, moved } = drag;
    setDrag(null);
    if (!moved) return onOpen(visit);
    if (!dayOffset && !minuteOffset) return;
    const day = addDays(visit.day, dayOffset);
    if (visit.isAllDay)
      return onMove(visit, { day, lastDay: addDays(visit.lastDay, dayOffset) });
    const length = minutesOf(visit.endTime) - minutesOf(visit.startTime);
    const start = Math.max(
      0,
      Math.min(24 * 60 - length - 1, minutesOf(visit.startTime) + minuteOffset),
    );
    onMove(visit, {
      day,
      startTime: timeOf(start),
      endTime: timeOf(start + length),
    });
  };

  const visitBox = (
    visit: AgendaVisitJson,
    dayIndex: number,
    style: React.CSSProperties,
    compact = false,
  ) => {
    const dragging = drag?.visit.id === visit.id;
    const draggable = canBook && visit.status === "BOOKED";
    return (
      <button
        key={`${visit.id}-${dayIndex}`}
        type="button"
        onPointerDown={(event) => startDrag(event, visit, dayIndex)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => setDrag(null)}
        onClick={(event) => {
          // Keyboard: Enter or Space opens it (pointer taps are handled on pointer up).
          if (event.detail === 0) onOpen(visit);
        }}
        style={{
          ...style,
          ...(dragging
            ? {
                transform: `translate(${drag!.dayOffset * drag!.columnWidth}px, ${(drag!.minuteOffset / 60) * HOUR_HEIGHT}px)`,
              }
            : {}),
        }}
        className={cn(
          "overflow-hidden rounded-md border px-1.5 py-1 text-left text-xs leading-tight shadow-sm touch-none select-none",
          visit.status === "DONE"
            ? "border-transparent bg-muted text-muted-foreground"
            : "border-primary/40 bg-primary/20 text-foreground",
          visit.isTentative &&
            visit.status === "BOOKED" &&
            "border-dashed opacity-75",
          draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          dragging && "z-20 ring-2 ring-primary",
        )}
        title={`${visit.job.name}${visit.label ? `, ${visit.label}` : ""}: ${visit.when}${draggable ? ". Drag to move." : ""}`}
      >
        <span className="block truncate font-semibold">{visit.job.name}</span>
        {!compact && (
          <span className="block truncate">
            {visit.isAllDay
              ? (visit.label ?? "All day")
              : `${timeWords(visit.startTime)}${visit.label ? ` · ${visit.label}` : ""}`}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card md:block">
      {/* Day headings */}
      <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b">
        <div />
        {days.map((day) => {
          const marker = busyMarker(
            dayCount(day),
            settings.dailyVisitWarningLimit,
          );
          return (
            <div
              key={day.day}
              className={cn(
                "flex items-start gap-1 border-l px-2 py-2",
                day.day === today && "bg-primary/10",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">
                  {shortWeekday(day.day)}
                </div>
                <div
                  className={cn(
                    "text-lg font-bold leading-tight",
                    day.day === today && "text-primary",
                  )}
                >
                  {dayNumber(day.day)}
                </div>
                <div className="flex flex-wrap gap-1">
                  {marker && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[11px] font-semibold",
                        marker.tone,
                      )}
                    >
                      {marker.text}
                    </span>
                  )}
                </div>
              </div>
              <DayMenu day={day.day} onBlockOut={onBlockOut} />
            </div>
          );
        })}
      </div>

      {/* All-day visits */}
      {hasAllDay && (
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b">
          <div className="px-1 py-1.5 text-[11px] text-muted-foreground">
            All day
          </div>
          {days.map((day, dayIndex) => (
            <div
              key={day.day}
              className="flex min-h-10 flex-col gap-1 border-l p-1"
            >
              {day.away && wholeDayAway(day) && (
                <AwayBlock away={day.away} onAway={onAway} />
              )}
              {day.visits
                .filter((visit) => visit.isAllDay)
                .map((visit) => visitBox(visit, dayIndex, {}, true))}
            </div>
          ))}
        </div>
      )}

      {/* The time grid */}
      <div className="relative grid grid-cols-[3rem_minmax(0,1fr)]">
        <div>
          {hours.map((hour) => (
            <div
              key={hour}
              style={{ height: HOUR_HEIGHT }}
              className="border-b px-1 text-right text-[11px] text-muted-foreground"
            >
              {timeWords(timeOf(hour * 60)).replace(":00", "")}
            </div>
          ))}
        </div>
        <div ref={columnsRef} className="relative grid grid-cols-7">
          {days.map((day, dayIndex) => {
            const items: GridItem[] = day.visits
              .filter((visit) => !visit.isAllDay)
              .map((visit) => ({
                visit,
                start: minutesOf(visit.startTime),
                end: minutesOf(visit.endTime) || 24 * 60,
              }));
            if (day.away && !wholeDayAway(day))
              items.push({ away: day.away, ...awayRange(day.away) });
            const { placed, count } = lanes(items);
            return (
              <div
                key={day.day}
                className={cn(
                  "relative border-l",
                  day.day === today && "bg-primary/5",
                )}
                style={{ height: hours.length * HOUR_HEIGHT }}
              >
                {hours.map((hour) => (
                  <div
                    key={hour}
                    style={{
                      top: (hour - firstHour) * HOUR_HEIGHT,
                      height: HOUR_HEIGHT,
                    }}
                    className="absolute inset-x-0 border-b border-border/60"
                  />
                ))}
                {placed.map(({ item, lane }) => {
                  const style: React.CSSProperties = {
                    position: "absolute",
                    top: ((item.start - gridTop) / 60) * HOUR_HEIGHT,
                    height: Math.max(
                      ((item.end - item.start) / 60) * HOUR_HEIGHT,
                      22,
                    ),
                    left: `calc(${(lane / count) * 100}% + 2px)`,
                    width: `calc(${100 / count}% - 4px)`,
                  };
                  return item.visit ? (
                    visitBox(item.visit, dayIndex, style)
                  ) : (
                    <AwayBlock
                      key={`away-${item.away.id}`}
                      away={item.away}
                      onAway={onAway}
                      style={style}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {canBook && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Drag a visit to move it to another time or day. Tap one to change it.
        </p>
      )}
    </div>
  );
}

// ─── Phone: the seven days as a list ────────────────────────────────────

function WeekList({
  days,
  today,
  settings,
  onOpen,
  onBlockOut,
  onAway,
}: {
  days: AgendaDayJson[];
  today: string;
  settings: WeekSettings;
  onOpen: (visit: AgendaVisitJson) => void;
  onBlockOut: (day: string) => void;
  onAway: (entry: LeaveJson) => void;
}) {
  /** When the time off starts in the day, for putting it in time order (0: all day or the morning). */
  const awayStart = (away: NonNullable<AgendaDayJson["away"]>) =>
    away.part === "AFTERNOON"
      ? 12 * 60
      : away.part === "HOURS" && away.fromTime
        ? minutesOf(away.fromTime)
        : 0;
  const awayRow = (away: NonNullable<AgendaDayJson["away"]>) => (
    <li key="away">
      <button
        type="button"
        onClick={() => onAway(away)}
        className="flex min-h-touch w-full items-center gap-3 px-4 py-2 text-left text-muted-foreground hover:bg-muted"
      >
        <span className="flex w-[4.75rem] shrink-0 items-center gap-1.5 text-sm font-semibold">
          <Plane className="size-4" aria-hidden />
          Away
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {[awayLabel(away), away.part !== "WHOLE" ? away.typeWords : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-2 md:hidden">
      {days.map((day) => {
        const marker = busyMarker(
          dayCount(day),
          settings.dailyVisitWarningLimit,
        );
        return (
          <section
            key={day.day}
            className={cn(
              "rounded-xl bg-card",
              day.away?.part === "WHOLE" && !day.visits.length && "opacity-70",
            )}
          >
            <header className="flex items-center gap-2 px-4 pt-2">
              <h3
                className={cn(
                  "flex-1 font-semibold",
                  day.day === today && "text-primary",
                )}
              >
                {day.day === today
                  ? `Today · ${dayWords(day.day)}`
                  : dayWords(day.day)}
              </h3>
              {marker && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    marker.tone,
                  )}
                >
                  {marker.text}
                </span>
              )}
              <DayMenu day={day.day} onBlockOut={onBlockOut} />
            </header>
            <ul className="divide-y pb-1">
              {/* Time order: a whole day or morning away first; an afternoon or some hours where they fall among the visits. */}
              {day.away && awayStart(day.away) === 0 && awayRow(day.away)}
              {day.visits.map((visit) => (
                <Fragment key={visit.id}>
                  {day.away &&
                    awayStart(day.away) > 0 &&
                    visit ===
                      day.visits.find(
                        (entry) =>
                          !entry.isAllDay &&
                          minutesOf(entry.startTime) >= awayStart(day.away!),
                      ) &&
                    awayRow(day.away)}
                  <li>
                    <button
                      type="button"
                      onClick={() => onOpen(visit)}
                      className={cn(
                        "flex min-h-touch w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted",
                        visit.isTentative &&
                          visit.status === "BOOKED" &&
                          "opacity-70",
                      )}
                    >
                      <span className="w-[4.75rem] shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums">
                        {visit.isAllDay
                          ? "All day"
                          : timeWords(visit.startTime)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {visit.job.name}
                        </span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {[
                            visit.label,
                            visit.isTentative && visit.status === "BOOKED"
                              ? "Tentative"
                              : null,
                            visit.status === "DONE" ? "Done" : null,
                            visit.job.suburb,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                </Fragment>
              ))}
              {day.away &&
                awayStart(day.away) > 0 &&
                !day.visits.some(
                  (entry) =>
                    !entry.isAllDay &&
                    minutesOf(entry.startTime) >= awayStart(day.away!),
                ) &&
                awayRow(day.away)}
              {!day.visits.length && !day.away && (
                <li className="px-4 py-2 text-sm text-muted-foreground">
                  Nothing booked
                </li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
