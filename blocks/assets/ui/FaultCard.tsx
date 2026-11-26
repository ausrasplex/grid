"use client";

// One fault on an asset's page (docs/assets-block.md §3): what was
// reported, where and by whom, its photos and every step since. Whoever
// looks after faults moves it along (Acknowledged, In repair, Fixed or
// Retired) or adds a note, each with a note of its own.
import { useState } from "react";
import { MapPin } from "lucide-react";
import { Alert, Badge, Button, FormActions, Label, Sheet, SheetContent, api, useAction } from "@grid/ui";
import { photoUrl, when } from "./shared";

export interface FaultJson {
  id: string;
  type: string;
  doNotUse: boolean;
  note: string | null;
  photoFileIds: string[];
  status: string;
  open: boolean;
  reportedBy: string;
  reportedAt: string;
  placeName: string | null;
  hasLocation: boolean;
  next: string[];
  events: { id: string; status: string | null; note: string | null; photoFileIds: string[]; doNotUse: boolean; by: string; at: string }[];
}

export const TYPE_WORDS: Record<string, string> = { FAULTY: "Faulty", DAMAGED: "Damaged", MISSING_PARTS: "Missing parts", FAILED_TEST: "Failed test", OTHER: "Other" };
export const STEP_WORDS: Record<string, string> = { REPORTED: "Reported", ACKNOWLEDGED: "Acknowledged", IN_REPAIR: "In repair", FIXED: "Fixed", RETIRED: "Retired" };
const STEP_BUTTONS: Record<string, string> = { ACKNOWLEDGED: "Acknowledge", IN_REPAIR: "Send for repair", FIXED: "Fixed", RETIRED: "Retire the asset" };

function Thumbs({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <a key={id} href={photoUrl(id, "original")} className="overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(id, "thumb")} alt="" className="size-16 object-cover" />
        </a>
      ))}
    </div>
  );
}

function StepSheet({ fault, step, onClose }: { fault: FaultJson; step: string | null; onClose: () => void }) {
  const [note, setNote] = useState("");
  const action = useAction();
  const retire = step === "RETIRED";
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        desktop="dialog"
        title={step ? STEP_BUTTONS[step]! : "Add a note"}
        description={retire ? "The fault is closed and the asset is retired: off the list, history and tag kept." : step === "FIXED" ? "The fault is closed. The asset goes back in service unless something else is open on it." : undefined}
      >
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api(`/assets/faults/${fault.id}/step`, { body: { status: step, note: note || null } });
              window.location.reload();
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="step-note">{step ? "Note (optional)" : "Note"}</Label>
            <textarea
              id="step-note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={step === "IN_REPAIR" ? "e.g. Sent to Makita service, job 4471" : step === "FIXED" ? "e.g. New cord fitted and tested" : undefined}
              className="rounded-lg border border-input bg-card px-3 py-2 text-base"
              autoFocus
            />
          </div>
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" variant={retire ? "destructive" : "default"} disabled={action.busy || (!step && !note.trim())}>
              {step ? STEP_BUTTONS[step] : "Add note"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function FaultCard({ fault, canManage }: { fault: FaultJson; canManage: boolean }) {
  const [step, setStep] = useState<string | null | undefined>(undefined);
  return (
    <article className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{TYPE_WORDS[fault.type] ?? "Fault"}</span>
        {fault.doNotUse && fault.open && <Badge variant="destructive">Do not use</Badge>}
        <Badge variant={fault.open ? "warning" : "secondary"}>{STEP_WORDS[fault.status]}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {[`${fault.reportedBy}, ${when(fault.reportedAt)}`, fault.placeName].filter(Boolean).join(" · ")}
        {fault.hasLocation && (
          <span className="ml-1 inline-flex items-center gap-0.5">
            · <MapPin className="size-3.5" /> phone location kept
          </span>
        )}
      </p>
      {fault.note && <p className="whitespace-pre-line">{fault.note}</p>}
      <Thumbs ids={fault.photoFileIds} />
      {fault.events.length > 1 && (
        <ol className="flex flex-col gap-2 border-l-2 border-muted pl-3">
          {fault.events.slice(1).map((event) => (
            <li key={event.id} className="flex flex-col gap-1">
              <span className="text-sm">
                <span className="font-semibold">{event.status ? STEP_WORDS[event.status] : event.doNotUse ? "Marked Do not use" : "Note"}</span>
                <span className="text-muted-foreground"> · {event.by}, {when(event.at)}</span>
              </span>
              {event.note && <span className="text-sm whitespace-pre-line">{event.note}</span>}
              <Thumbs ids={event.photoFileIds} />
            </li>
          ))}
        </ol>
      )}
      {canManage && fault.open && (
        <div className="flex flex-wrap gap-2">
          {fault.next
            .filter((next) => next !== "RETIRED")
            .map((next) => (
              <Button key={next} variant={next === "FIXED" ? "default" : "outline"} onClick={() => setStep(next)}>
                {STEP_BUTTONS[next]}
              </Button>
            ))}
          <Button variant="ghost" onClick={() => setStep(null)}>
            Add a note
          </Button>
          {fault.next.includes("RETIRED") && (
            <Button variant="ghost" className="text-destructive" onClick={() => setStep("RETIRED")}>
              {STEP_BUTTONS.RETIRED}
            </Button>
          )}
        </div>
      )}
      {step !== undefined && <StepSheet fault={fault} step={step} onClose={() => setStep(undefined)} />}
    </article>
  );
}
