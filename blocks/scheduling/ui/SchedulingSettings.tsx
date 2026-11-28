"use client";

// Settings › Scheduling & time off (docs/scheduling-block.md): your daily
// visit warning limit, your time off (saved as approved, like the Leave
// Block's), and the business's booking defaults for whoever can change them.
import { useState } from "react";
import { Plane, Plus } from "lucide-react";
import { Alert, Button, EmptyState, Field, PageHeader, Section, SelectField, Sheet, SheetContent, Stack, api, useAction } from "@grid/ui";
import { dayWords, lengthWords } from "../words";
import type { AgendaVisitJson, LeaveJson } from "./types";

const LEAVE_TYPES: { value: string; label: string }[] = [
  { value: "ANNUAL", label: "Annual" },
  { value: "PERSONAL", label: "Personal/carer's" },
  { value: "COMPASSIONATE", label: "Compassionate" },
  { value: "LONG_SERVICE", label: "Long service" },
  { value: "PARENTAL", label: "Parental" },
  { value: "COMMUNITY_SERVICE", label: "Community service" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "RDO", label: "RDO" },
  { value: "OTHER", label: "Other" },
];
const typeWords = (type: string) => LEAVE_TYPES.find((option) => option.value === type)?.label ?? type;
const PARTS = [
  { value: "WHOLE", label: "All day" },
  { value: "MORNING", label: "Morning only" },
  { value: "AFTERNOON", label: "Afternoon only" },
];
const LENGTHS = [30, 60, 90, 120, 180, 240, 480].map((minutes) => ({ value: String(minutes), label: lengthWords(minutes) }));

interface Business {
  defaultVisitLengthMinutes: number;
  dayStartsAt: string;
  dayEndsAt: string;
}

export function SchedulingSettings({
  business,
  mine,
  timeOff,
  canChangeBusiness,
  today,
}: {
  business: Business;
  mine: { dailyVisitWarningLimit: number | null };
  timeOff: LeaveJson[];
  canChangeBusiness: boolean;
  today: string;
}) {
  return (
    <>
      <PageHeader title="Scheduling & time off" subtitle="Your own warnings and time away, and how new visits start out." />
      <Stack>
        <TimeOff initial={timeOff} today={today} />
        <DailyLimit initial={mine.dailyVisitWarningLimit} />
        {canChangeBusiness && <BookingDefaults initial={business} />}
      </Stack>
    </>
  );
}

function DailyLimit({ initial }: { initial: number | null }) {
  const [limit, setLimit] = useState(initial ? String(initial) : "");
  const [saved, setSaved] = useState(initial ? String(initial) : "");
  const action = useAction();
  return (
    <Section title="Busy day warning" description="Warns you when booking would put more than this many visits on one day. It never stops you booking. Leave it empty for no warning.">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            const result = await api<{ dailyVisitWarningLimit: number | null }>("/scheduling/settings/mine", { method: "PUT", body: { dailyVisitWarningLimit: limit ? Number(limit) : null } });
            const value = result.dailyVisitWarningLimit ? String(result.dailyVisitWarningLimit) : "";
            setLimit(value);
            setSaved(value);
          });
        }}
      >
        <div className="sm:w-60">
          <Field label="Visits a day" type="number" inputMode="numeric" min={1} max={50} placeholder="No warning" value={limit} onChange={(event) => setLimit(event.target.value)} />
        </div>
        <Button type="submit" disabled={limit === saved || action.busy}>
          Save
        </Button>
      </form>
      <Alert variant="error">{action.error}</Alert>
    </Section>
  );
}

function partText(entry: LeaveJson) {
  const part = (value: LeaveJson["firstDayPart"]) => (value === "MORNING" ? " (morning)" : value === "AFTERNOON" ? " (afternoon)" : "");
  if (entry.startsOn === entry.endsOn) return `${dayWords(entry.startsOn)}${part(entry.firstDayPart)}`;
  return `${dayWords(entry.startsOn)}${part(entry.firstDayPart)} – ${dayWords(entry.endsOn)}${part(entry.lastDayPart)}`;
}

function TimeOff({ initial, today }: { initial: LeaveJson[]; today: string }) {
  const [entries, setEntries] = useState(initial);
  const [editing, setEditing] = useState<LeaveJson | "new" | null>(null);
  return (
    <Section
      title="Time off"
      description="Days you're away. They show as Away on your schedule, and booking a visit on them asks first."
      flush={entries.length > 0}
      actions={
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          Add time off
        </Button>
      }
    >
      {entries.length ? (
        <ul className="divide-y">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button type="button" onClick={() => setEditing(entry)} className="flex min-h-touch-lg w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted sm:px-6">
                <Plane className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{partText(entry)}</span>
                  <span className="truncate text-sm text-muted-foreground">{[typeWords(entry.type), entry.note].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No time off coming up" />
      )}
      {editing && (
        <TimeOffSheet
          entry={editing === "new" ? null : editing}
          today={today}
          onClose={() => setEditing(null)}
          onSaved={(saved) =>
            setEntries((list) => [...list.filter((entry) => entry.id !== saved.id), saved].sort((first, second) => first.startsOn.localeCompare(second.startsOn)))
          }
          onDeleted={(id) => setEntries((list) => list.filter((entry) => entry.id !== id))}
        />
      )}
    </Section>
  );
}

function TimeOffSheet({ entry, today, onClose, onSaved, onDeleted }: { entry: LeaveJson | null; today: string; onClose: () => void; onSaved: (entry: LeaveJson) => void; onDeleted: (id: string) => void }) {
  const [type, setType] = useState(entry?.type ?? "ANNUAL");
  const [startsOn, setStartsOn] = useState(entry?.startsOn ?? today);
  const [endsOn, setEndsOn] = useState(entry?.endsOn ?? today);
  const [firstDayPart, setFirstDayPart] = useState<string>(entry?.firstDayPart ?? "WHOLE");
  const [lastDayPart, setLastDayPart] = useState<string>(entry?.lastDayPart ?? "WHOLE");
  const [note, setNote] = useState(entry?.note ?? "");
  // After saving: booked visits that fall in it, to move.
  const [clashing, setClashing] = useState<AgendaVisitJson[] | null>(null);
  const action = useAction();
  const oneDay = startsOn === endsOn;
  if (clashing)
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          desktop="dialog"
          title={`${clashing.length} visit${clashing.length === 1 ? " is" : "s are"} booked while you're away`}
          description="Your time off is saved. Nothing's been moved: open each job to change its visit, or leave it."
          footer={
            <Button className="w-full" onClick={onClose}>
              Done
            </Button>
          }
        >
          <ul className="flex flex-col divide-y px-2">
            {clashing.map((visit) => (
              <li key={visit.id}>
                <a href={`/jobs/${visit.job.id}`} className="flex min-h-touch-lg flex-col justify-center py-2 hover:underline">
                  <span className="font-semibold">{visit.job.name}</span>
                  <span className="text-sm text-muted-foreground">{[visit.when, visit.label].filter(Boolean).join(" · ")}</span>
                </a>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    );
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        desktop="dialog"
        title={entry ? "Change time off" : "Add time off"}
        description="Approved straight away: it's your own planning."
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="time-off-form" className="flex-1" disabled={action.busy}>
              {action.busy ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        <form
          id="time-off-form"
          className="flex flex-col gap-4 px-2 pb-2"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              const body = { type, startsOn, endsOn: endsOn < startsOn ? startsOn : endsOn, firstDayPart, lastDayPart: oneDay ? firstDayPart : lastDayPart, note: note || null };
              type Saved = { timeOff: LeaveJson; visitsDuringTimeOff: AgendaVisitJson[] };
              const saved = entry ? await api<Saved>(`/scheduling/time-off/${entry.id}`, { method: "PUT", body }) : await api<Saved>("/scheduling/time-off", { body });
              onSaved(saved.timeOff);
              if (saved.visitsDuringTimeOff.length) setClashing(saved.visitsDuringTimeOff);
              else onClose();
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" type="date" value={startsOn} onChange={(event) => (setStartsOn(event.target.value), endsOn < event.target.value && setEndsOn(event.target.value))} required />
            <Field label="To" type="date" min={startsOn} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label={oneDay ? "Which part" : "First day"} options={PARTS} value={firstDayPart} onChange={(event) => setFirstDayPart(event.target.value)} />
            {!oneDay && <SelectField label="Last day" options={PARTS} value={lastDayPart} onChange={(event) => setLastDayPart(event.target.value)} />}
          </div>
          <SelectField label="Type" options={LEAVE_TYPES} value={type} onChange={(event) => setType(event.target.value)} />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Note (optional, private)
            <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Bali" className="w-full rounded-md border border-input bg-card px-3 py-2 text-base font-normal" />
          </label>
          <Alert variant="error">{action.error}</Alert>
          {entry && (
            <Button
              type="button"
              variant="ghost"
              className="self-start px-0 text-destructive hover:bg-transparent hover:underline"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await api(`/scheduling/time-off/${entry.id}`, { method: "DELETE" });
                  onDeleted(entry.id);
                  onClose();
                })
              }
            >
              Remove this time off
            </Button>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}

function BookingDefaults({ initial }: { initial: Business }) {
  const [form, setForm] = useState({ defaultVisitLengthMinutes: String(initial.defaultVisitLengthMinutes), dayStartsAt: initial.dayStartsAt, dayEndsAt: initial.dayEndsAt });
  const [saved, setSaved] = useState(form);
  const action = useAction();
  const changed = JSON.stringify(form) !== JSON.stringify(saved);
  const lengths = LENGTHS.some((option) => option.value === form.defaultVisitLengthMinutes)
    ? LENGTHS
    : [...LENGTHS, { value: form.defaultVisitLengthMinutes, label: lengthWords(Number(form.defaultVisitLengthMinutes)) }];
  return (
    <Section title="Booking defaults" description="For the whole business. The working day only sets what the week view shows: it never stops a booking.">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            const result = await api<Business>("/scheduling/settings", { method: "PUT", body: { ...form, defaultVisitLengthMinutes: Number(form.defaultVisitLengthMinutes) } });
            const next = { defaultVisitLengthMinutes: String(result.defaultVisitLengthMinutes), dayStartsAt: result.dayStartsAt, dayEndsAt: result.dayEndsAt };
            setForm(next);
            setSaved(next);
          });
        }}
      >
        <SelectField label="A new visit lasts" options={lengths} value={form.defaultVisitLengthMinutes} onChange={(event) => setForm({ ...form, defaultVisitLengthMinutes: event.target.value })} />
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Field label="Working day starts" type="time" step={900} value={form.dayStartsAt} onChange={(event) => setForm({ ...form, dayStartsAt: event.target.value })} />
          <Field label="Working day ends" type="time" step={900} value={form.dayEndsAt} onChange={(event) => setForm({ ...form, dayEndsAt: event.target.value })} />
        </div>
        <Alert variant="error">{action.error}</Alert>
        <div>
          <Button type="submit" disabled={!changed || action.busy}>
            Save
          </Button>
        </div>
      </form>
    </Section>
  );
}
