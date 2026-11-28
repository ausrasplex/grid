"use client";

// Visits on the job page (docs/scheduling-block.md). One visit reads like a
// date on the job ("Booked: Thu 3 Dec, 8:00 am – 10:00 am") with "Add
// another visit"; two or more become a list. Marking the last open visit
// done asks "Mark job complete?" (never automatic).
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, Check, MoreHorizontal, Plus } from "lucide-react";
import {
  Alert,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Section,
  Sheet,
  SheetContent,
  api,
  cn,
  useAction,
} from "@grid/ui";
import { VisitSheet } from "./VisitSheet";
import type { VisitJson } from "./types";

export function JobVisits({
  jobId,
  jobName,
  initial,
  today,
  defaultLengthMinutes,
  canBook,
  canComplete,
  readOnly,
}: {
  jobId: string;
  jobName: string;
  initial: VisitJson[];
  today: string;
  defaultLengthMinutes: number;
  canBook: boolean;
  canComplete: boolean;
  /** Archived or finished: shown, not changed. */
  readOnly: boolean;
}) {
  const [visits, setVisits] = useState(initial);
  const [editing, setEditing] = useState<VisitJson | "new" | null>(null);
  const [askComplete, setAskComplete] = useState(false);
  const router = useRouter();
  const action = useAction();
  const bookable = canBook && !readOnly;

  // "Book" on the Schedule's To be booked list opens this with ?book=1.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("book") !== "1") return;
    url.searchParams.delete("book");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    if (bookable) setEditing("new");
  }, [bookable]);

  const put = (visit: VisitJson) =>
    setVisits((list) => {
      const next = list.some((entry) => entry.id === visit.id) ? list.map((entry) => (entry.id === visit.id ? visit : entry)) : [...list, visit];
      return next.sort((first, second) => Number(first.status === "CANCELLED") - Number(second.status === "CANCELLED") || first.startsAt.localeCompare(second.startsAt));
    });

  const setStatus = (visit: VisitJson, status: VisitJson["status"]) =>
    action.run(async () => {
      const result = await api<{ visit: VisitJson; askToComplete: boolean }>(`/scheduling/visits/${visit.id}/status`, { body: { status } });
      put(result.visit);
      if (result.askToComplete && canComplete) setAskComplete(true);
    });
  const confirm = (visit: VisitJson) => action.run(async () => put(await api<VisitJson>(`/scheduling/visits/${visit.id}/confirm`, { method: "POST" })));

  const live = visits.filter((visit) => visit.status !== "CANCELLED");
  const cancelled = visits.length - live.length;
  const single = live.length === 1 ? live[0]! : null;

  return (
    <Section
      title="Visits"
      description={live.length === 0 ? "Not booked yet." : single ? undefined : `${live.length} visits${cancelled ? ` · ${cancelled} cancelled` : ""}`}
      flush={live.length > 1}
    >
      {single ? (
        <div className="flex items-start gap-3">
          <VisitLine visit={single} prefix={single.status === "DONE" ? "Done" : "Booked"} />
          {bookable && <VisitMenu visit={single} onChange={() => setEditing(single)} onConfirm={() => void confirm(single)} onStatus={(status) => void setStatus(single, status)} today={today} />}
        </div>
      ) : live.length > 1 ? (
        <ul className="divide-y">
          {live.map((visit) => (
            <li key={visit.id} className="flex items-start gap-3 px-4 py-3 sm:px-6">
              <VisitLine visit={visit} />
              {bookable && <VisitMenu visit={visit} onChange={() => setEditing(visit)} onConfirm={() => void confirm(visit)} onStatus={(status) => void setStatus(visit, status)} today={today} />}
            </li>
          ))}
        </ul>
      ) : null}
      {bookable && (
        <div className={cn(live.length > 1 && "px-4 pb-4 sm:px-6", live.length && "mt-3")}>
          {live.length === 0 ? (
            <Button onClick={() => setEditing("new")}>
              <CalendarDays aria-hidden />
              Book a visit
            </Button>
          ) : (
            <Button variant="ghost" className="px-0 text-primary hover:bg-transparent hover:underline" onClick={() => setEditing("new")}>
              <Plus aria-hidden />
              Add another visit
            </Button>
          )}
        </div>
      )}
      {single && cancelled > 0 && <p className="mt-2 text-sm text-muted-foreground">{cancelled} cancelled</p>}
      <Alert variant="error">{action.error}</Alert>

      {editing && (
        <VisitSheet
          open
          onOpenChange={(open) => !open && setEditing(null)}
          jobId={jobId}
          jobName={jobName}
          visit={editing === "new" ? null : editing}
          today={today}
          defaultLengthMinutes={defaultLengthMinutes}
          onSaved={(visit) => {
            put(visit);
            router.refresh();
          }}
        />
      )}

      <Sheet open={askComplete} onOpenChange={setAskComplete}>
        <SheetContent
          desktop="dialog"
          title="Mark job complete?"
          description="That was the last booked visit. Finish the job now, or leave it open to book another."
          footer={
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setAskComplete(false)}>
                Not yet
              </Button>
              <Button
                className="flex-1"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await api(`/projects/${jobId}/status`, { body: { status: "COMPLETED" } });
                    setAskComplete(false);
                    router.refresh();
                  })
                }
              >
                Mark complete
              </Button>
            </div>
          }
        >
          <span />
        </SheetContent>
      </Sheet>
    </Section>
  );
}

function VisitLine({ visit, prefix }: { visit: VisitJson; prefix?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", visit.isTentative && visit.status === "BOOKED" && "opacity-70")}>
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">
          {prefix ? `${prefix}: ` : ""}
          {visit.when}
        </span>
        {visit.isTentative && visit.status === "BOOKED" && <span className="rounded-full border border-dashed px-2 py-0.5 text-xs font-semibold">Tentative</span>}
        {visit.status === "DONE" && !prefix && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
            <Check className="size-3" aria-hidden />
            Done
          </span>
        )}
      </span>
      {(visit.label || visit.notes) && <span className="text-sm text-muted-foreground">{[visit.label, visit.notes].filter(Boolean).join(" · ")}</span>}
    </div>
  );
}

function VisitMenu({
  visit,
  today,
  onChange,
  onConfirm,
  onStatus,
}: {
  visit: VisitJson;
  today: string;
  onChange: () => void;
  onConfirm: () => void;
  onStatus: (status: VisitJson["status"]) => void;
}) {
  const started = visit.day <= today;
  return (
    <div className="flex shrink-0 items-center gap-1">
      {visit.status === "BOOKED" && visit.isTentative && (
        <Button variant="outline" onClick={onConfirm}>
          Confirm
        </Button>
      )}
      {visit.status === "BOOKED" && !visit.isTentative && started && (
        <Button variant="outline" onClick={() => onStatus("DONE")}>
          <Check aria-hidden />
          Done
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="More for this visit">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {visit.status === "BOOKED" && <DropdownMenuItem onSelect={onChange}>Change</DropdownMenuItem>}
          {visit.status === "BOOKED" && started && visit.isTentative && <DropdownMenuItem onSelect={() => onStatus("DONE")}>Mark done</DropdownMenuItem>}
          {visit.status === "DONE" && <DropdownMenuItem onSelect={() => onStatus("BOOKED")}>Not done yet</DropdownMenuItem>}
          {visit.status === "BOOKED" && <DropdownMenuItem onSelect={() => onStatus("CANCELLED")}>Cancel visit</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
