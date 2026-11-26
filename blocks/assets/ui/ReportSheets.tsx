"use client";

// Report a fault (docs/assets-block.md §3) and Report lost or stolen
// (§3a), from the asset's Actions. A fault: what's wrong, a note, photos,
// Do not use for anything unsafe, and the phone's location if you allow
// it. With a report already open, adding to it is offered first. Lost:
// the last known whereabouts filled in to check, Lost or Stolen, and the
// police report number for stolen gear.
import { useEffect, useState } from "react";
import { AlertTriangle, MapPin, SearchX } from "lucide-react";
import { Alert, Button, Field, FormActions, Label, Segmented, SelectField, Sheet, SheetContent, Switch, api, useAction } from "@grid/ui";
import { Photos } from "./AssetSheet";
import type { AssetJson } from "./shared";

export const FAULT_TYPES = [
  { value: "FAULTY", label: "Faulty" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "MISSING_PARTS", label: "Missing parts" },
  { value: "FAILED_TEST", label: "Failed test" },
  { value: "OTHER", label: "Other" },
];

export interface OpenFault {
  id: string;
  type: string;
  doNotUse: boolean;
  note: string | null;
}

function TextArea({ id, label, value, onChange, rows = 3, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-2 lg:max-w-2xl">
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-input bg-card px-3 py-2 text-base" />
    </div>
  );
}

/** The phone's location, only when asked for, and only if it gives it within 8 seconds. */
const position = () =>
  new Promise<{ lat: number; lng: number } | null>((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (found) => resolve({ lat: found.coords.latitude, lng: found.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });

export function FaultSheet({ asset, open, onClose, onDone }: { asset: AssetJson; open: OpenFault | null; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"add" | "new">(open ? "add" : "new");
  const [type, setType] = useState("FAULTY");
  const [doNotUse, setDoNotUse] = useState(false);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [withLocation, setWithLocation] = useState(false);
  const action = useAction();
  const adding = mode === "add" && !!open;

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent desktop="dialog" title="Report a fault" description={`Asset No. ${asset.number}, ${asset.name}. ${asset.holder.text}.`}>
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              const where = withLocation ? await position() : null;
              await api(`/assets/${asset.id}/faults`, {
                body: { type: adding ? open!.type : type, doNotUse, note: note || null, photoFileIds: photos, lat: where?.lat ?? null, lng: where?.lng ?? null, addTo: adding ? open!.id : null, anyway: !!open && !adding },
              });
              onDone();
            });
          }}
        >
          {open && (
            <div className="flex flex-col gap-2">
              <Alert>
                There&apos;s already an open fault: {FAULT_TYPES.find((entry) => entry.value === open.type)?.label ?? "Fault"}
                {open.doNotUse ? ", Do not use" : ""}
                {open.note ? `. "${open.note}"` : "."}
              </Alert>
              <Segmented
                label="This is"
                value={mode}
                onChange={setMode}
                items={[
                  { value: "add", label: "Add to that report" },
                  { value: "new", label: "A different fault" },
                ]}
              />
            </div>
          )}
          {!adding && <SelectField label="What's wrong" value={type} onChange={(event) => setType(event.target.value)} options={FAULT_TYPES} />}
          <TextArea id="fault-note" label={adding ? "What to add" : "What happened"} value={note} onChange={setNote} placeholder="e.g. Cord's cut near the plug" />
          <Photos ids={photos} onChange={setPhotos} onError={action.setError} />
          {!(adding && open!.doNotUse) && (
            <label className="flex min-h-touch items-start justify-between gap-3 rounded-xl bg-destructive/10 p-3">
              <span>
                <span className="flex items-center gap-2 font-semibold text-destructive">
                  <AlertTriangle className="size-4" /> Do not use
                </span>
                <span className="block text-sm text-muted-foreground">For anything unsafe. Nobody can check it out until it&apos;s fixed, and anyone who opens it sees a warning.</span>
              </span>
              <Switch checked={doNotUse} onCheckedChange={setDoNotUse} aria-label="Do not use" />
            </label>
          )}
          <label className="flex min-h-touch items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm">
              <MapPin className="size-4 text-muted-foreground" /> Add my phone&apos;s location
            </span>
            <Switch checked={withLocation} onCheckedChange={setWithLocation} aria-label="Add my phone's location" />
          </label>
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" variant={doNotUse ? "destructive" : "default"} disabled={action.busy || (adding && !note.trim() && !photos.length && !doNotUse)}>
              {action.busy ? "Sending…" : adding ? "Add to the report" : doNotUse ? "Report: Do not use" : "Report the fault"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function LostSheet({ asset, onClose, onDone }: { asset: AssetJson; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<"LOST" | "STOLEN">("LOST");
  const [lastKnown, setLastKnown] = useState("");
  const [note, setNote] = useState("");
  const [policeReport, setPoliceReport] = useState("");
  const action = useAction();
  useEffect(() => {
    void api<{ text: string }>(`/assets/${asset.id}/last-known`)
      .then((found) => setLastKnown((current) => current || found.text))
      .catch(() => {});
  }, [asset.id]);

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent desktop="dialog" title="Report lost or stolen" description={`Asset No. ${asset.number}, ${asset.name}. Owners and Foremen are told straight away.`}>
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api(`/assets/${asset.id}/lost`, { body: { kind, lastKnown: lastKnown || null, note: note || null, policeReport: policeReport || null } });
              onDone();
            });
          }}
        >
          <Segmented
            label="It's"
            value={kind}
            onChange={setKind}
            items={[
              { value: "LOST", label: "Lost" },
              { value: "STOLEN", label: "Stolen" },
            ]}
          />
          <TextArea id="lost-where" label="Last known whereabouts" rows={2} value={lastKnown} onChange={setLastKnown} />
          <p className="-mt-2 text-sm text-muted-foreground">From its last check-out or move. Fix it if you know better.</p>
          {kind === "STOLEN" && <Field label="Police report number (optional)" hint="For the insurance claim." value={policeReport} onChange={(event) => setPoliceReport(event.target.value)} />}
          <TextArea id="lost-note" label="Note (optional)" value={note} onChange={setNote} />
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" variant="destructive" disabled={action.busy}>
              <SearchX /> {kind === "STOLEN" ? "Mark as stolen" : "Mark as lost"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}
