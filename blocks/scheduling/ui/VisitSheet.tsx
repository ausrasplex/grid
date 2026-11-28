"use client";

// Book or change a visit (docs/scheduling-block.md): a day and a start
// time (the finish fills in from the business's visit length), or all day
// over one or more days. Tentative for "builder says probably Thursday".
// A clash, a busy day or time off comes back as warnings: Book anyway, or
// pick another time.
import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Alert, Button, Checkbox, Field, Sheet, SheetContent, Switch, api, cn, useAction } from "@grid/ui";
import { lengthWords } from "../words";
import type { VisitJson } from "./types";

const LABELS = ["Rough-in", "Fit-off", "Service", "Quote visit", "Inspection"];

export interface Warning {
  kind: "overlap" | "dailyLimit" | "timeOff";
  message: string;
}

type SaveResult = { saved: true; visit: VisitJson } | { saved: false; warnings: Warning[] };

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const timeOf = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function VisitSheet({
  open,
  onOpenChange,
  jobId,
  jobName,
  visit,
  today,
  defaultLengthMinutes,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobName: string;
  /** Changing this visit; none: booking a new one. */
  visit?: VisitJson | null;
  /** "2026-11-28" on the server. */
  today: string;
  defaultLengthMinutes: number;
  onSaved: (visit: VisitJson) => void;
}) {
  const [day, setDay] = useState(visit?.day ?? today);
  const [isAllDay, setAllDay] = useState(visit?.isAllDay ?? false);
  const [lastDay, setLastDay] = useState(visit?.lastDay ?? visit?.day ?? today);
  const [startTime, setStartTime] = useState(visit && !visit.isAllDay ? visit.startTime : "08:00");
  const [endTime, setEndTime] = useState(visit && !visit.isAllDay ? visit.endTime : timeOf(Math.min(minutesOf("08:00") + defaultLengthMinutes, 24 * 60 - 1)));
  const [isTentative, setTentative] = useState(visit?.isTentative ?? false);
  const [label, setLabel] = useState(visit?.label ?? "");
  const [notes, setNotes] = useState(visit?.notes ?? "");
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const action = useAction();

  // Moving the start keeps the visit's length.
  const changeStart = (next: string) => {
    if (!next) return setStartTime(next);
    const length = Math.max(minutesOf(endTime) - minutesOf(startTime), 15);
    setStartTime(next);
    setEndTime(timeOf(Math.min(minutesOf(next) + length, 24 * 60 - 1)));
    setWarnings([]);
  };

  const save = (isWarningAcknowledged: boolean) =>
    action.run(async () => {
      const body = {
        day,
        isAllDay,
        ...(isAllDay ? { lastDay: lastDay < day ? day : lastDay } : { startTime, endTime }),
        isTentative,
        label: label || null,
        notes: notes || null,
        isWarningAcknowledged,
      };
      const result = visit
        ? await api<SaveResult>(`/scheduling/visits/${visit.id}`, { method: "PUT", body })
        : await api<SaveResult>(`/scheduling/jobs/${jobId}/visits`, { body });
      if (!result.saved) return setWarnings(result.warnings);
      setWarnings([]);
      onSaved(result.visit);
      onOpenChange(false);
    });

  const length = !isAllDay && startTime && endTime ? minutesOf(endTime) - minutesOf(startTime) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        desktop="dialog"
        title={visit ? "Change visit" : "Book a visit"}
        description={jobName}
        footer={
          warnings.length ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setWarnings([])}>
                Pick another time
              </Button>
              <Button type="button" className="flex-1" disabled={action.busy} onClick={() => void save(true)}>
                {visit ? "Save anyway" : "Book anyway"}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" form="visit-form" className="flex-1" disabled={action.busy}>
                {action.busy ? "Saving…" : visit ? "Save" : "Book"}
              </Button>
            </div>
          )
        }
      >
        <form
          id="visit-form"
          className="flex flex-col gap-4 px-2 pb-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
        >
          {/* First thing in the sheet, so it's seen without scrolling. */}
          {warnings.length > 0 && (
            <div role="alert" className="flex flex-col gap-2 rounded-lg bg-warning/15 p-3">
              {warnings.map((warning) => (
                <p key={warning.message} className="flex items-start gap-2 text-sm font-semibold">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {warning.message}
                </p>
              ))}
            </div>
          )}
          <Field label={isAllDay ? "First day" : "Day"} type="date" value={day} onChange={(event) => (setDay(event.target.value), setWarnings([]))} required />
          <label className="flex min-h-touch items-center justify-between gap-3 text-sm font-medium">
            All day
            <Switch checked={isAllDay} onCheckedChange={(checked) => (setAllDay(checked), setWarnings([]))} />
          </label>
          {isAllDay ? (
            <Field label="Last day" hint="The same day for a one-day job." type="date" min={day} value={lastDay < day ? day : lastDay} onChange={(event) => (setLastDay(event.target.value), setWarnings([]))} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start" type="time" step={900} value={startTime} onChange={(event) => changeStart(event.target.value)} required />
              <Field label="Finish" type="time" step={900} value={endTime} onChange={(event) => (setEndTime(event.target.value), setWarnings([]))} hint={length > 0 ? lengthWords(length) : undefined} required />
            </div>
          )}
          <label className="flex min-h-touch items-start gap-3 text-sm">
            <Checkbox className="mt-0.5" checked={isTentative} onCheckedChange={(checked) => setTentative(checked === true)} />
            <span>
              <span className="font-medium">Not confirmed yet</span>
              <span className="block text-muted-foreground">Tentative, like "builder says probably Thursday". Shown faded until you confirm it.</span>
            </span>
          </label>
          <div className="flex flex-col gap-2">
            <Field label="Label (optional)" placeholder="e.g. Rough-in, Fit-off" value={label} onChange={(event) => setLabel(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              {LABELS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setLabel(label === option ? "" : option)}
                  className={cn("min-h-9 rounded-full border px-3 text-sm font-semibold", label === option ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted")}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Notes (optional)
            <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Ring Sam when you're 10 minutes away" className="w-full rounded-md border border-input bg-card px-3 py-2 text-base font-normal" />
          </label>
          <Alert variant="error">{action.error}</Alert>
        </form>
      </SheetContent>
    </Sheet>
  );
}
