"use client";

// The asset's Actions (docs/assets-block.md §2a). The first button follows
// its state: Check out when it's free, Return when you have it, Take over
// when someone else has it, greyed out when it mustn't be used. A Foreman
// (assets.assign) also gets Move: to the workshop, a van or a job, or to
// someone else. Fault and Lost join these in part 3.
import { useEffect, useState } from "react";
import { ArrowRightLeft, Hand, LogIn, LogOut } from "lucide-react";
import { Alert, Button, Field, FormActions, Label, Segmented, SelectField, Sheet, SheetContent, api, useAction } from "@grid/ui";
import type { AssetJson } from "./shared";

interface Places {
  jobs: { id: string; name: string; siteName: string; jobNumber: string | null }[];
  stores: string[];
  vans: string[];
  people: { id: string; name: string }[];
}
interface Area {
  buildingId: string;
  levelId: string | null;
  name: string;
}
interface JobPick {
  projectId: string;
  area: string;
}

const NONE = "none";
const areaKey = (area: Pick<Area, "buildingId" | "levelId">) => `${area.buildingId}|${area.levelId ?? ""}`;

/** "On a job" and, when it has more than one, which building or level. */
function JobPicker({ places, value, onChange, optional }: { places: Places; value: JobPick; onChange: (value: JobPick) => void; optional: boolean }) {
  const [areas, setAreas] = useState<Area[]>([]);
  useEffect(() => {
    setAreas([]);
    if (!value.projectId) return;
    void api<Area[]>(`/assets/places/job/${value.projectId}`)
      .then(setAreas)
      .catch(() => {});
  }, [value.projectId]);
  return (
    <>
      <SelectField
        label={optional ? "On a job (optional)" : "Which job"}
        value={value.projectId || NONE}
        onChange={(event) => onChange({ projectId: event.target.value === NONE ? "" : event.target.value, area: "" })}
        options={[
          ...(optional ? [{ value: NONE, label: "No job" }] : [{ value: NONE, label: "Pick a job", disabled: true }]),
          ...places.jobs.map((job) => ({ value: job.id, label: [job.name, job.jobNumber, job.siteName !== job.name ? job.siteName : null].filter(Boolean).join(" · ") })),
        ]}
      />
      {areas.length > 1 && (
        <SelectField
          label="Where on the job"
          value={value.area || NONE}
          onChange={(event) => onChange({ ...value, area: event.target.value === NONE ? "" : event.target.value })}
          options={[{ value: NONE, label: "The whole job" }, ...areas.map((area) => ({ value: areaKey(area), label: area.name }))]}
        />
      )}
    </>
  );
}

const jobBody = (pick: JobPick) => {
  const [buildingId, levelId] = pick.area ? pick.area.split("|") : [];
  return { projectId: pick.projectId || null, buildingId: buildingId || null, levelId: levelId || null };
};

function Note({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-2 lg:max-w-2xl">
      <Label htmlFor="custody-note">Note (optional)</Label>
      <textarea id="custody-note" rows={2} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-input bg-card px-3 py-2 text-base" />
    </div>
  );
}

function usePlaces() {
  const [places, setPlaces] = useState<Places | null>(null);
  useEffect(() => {
    void api<Places>("/assets/places")
      .then(setPlaces)
      .catch(() => setPlaces({ jobs: [], stores: ["Workshop"], vans: [], people: [] }));
  }, []);
  return places;
}

function CheckOutSheet({ asset, canAssign, solo, onClose, onDone }: { asset: AssetJson; canAssign: boolean; solo: boolean; onClose: () => void; onDone: () => void }) {
  const places = usePlaces();
  const [who, setWho] = useState("me");
  // A job it's already on (left there) is the likely one.
  const [job, setJob] = useState<JobPick>({ projectId: asset.holder.projectId ?? "", area: asset.holder.buildingId ? areaKey({ buildingId: asset.holder.buildingId, levelId: asset.holder.levelId }) : "" });
  const [note, setNote] = useState("");
  const action = useAction();
  const people = canAssign && !solo ? (places?.people ?? []) : [];
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title={`Check out Asset No. ${asset.number}`} description={asset.name}>
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api(`/assets/${asset.id}/check-out`, { body: { userId: who === "me" ? null : who, ...jobBody(job), note: note || null } });
              onDone();
            });
          }}
        >
          {people.length > 0 && <SelectField label="Who's got it" value={who} onChange={(event) => setWho(event.target.value)} options={[{ value: "me", label: "Me" }, ...people.map((person) => ({ value: person.id, label: person.name }))]} />}
          {places && <JobPicker places={places} value={job} onChange={setJob} optional />}
          <Note value={note} onChange={setNote} />
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={action.busy || !places}>
              <LogOut /> {who === "me" ? "I've got it" : "Check out"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type Where = "STORE" | "VEHICLE" | "PROJECT";

function ReturnSheet({ asset, moving, onClose, onDone }: { asset: AssetJson; moving: boolean; onClose: () => void; onDone: () => void }) {
  const places = usePlaces();
  const [where, setWhere] = useState<Where>("STORE");
  const [store, setStore] = useState("Workshop");
  const [van, setVan] = useState("");
  const [job, setJob] = useState<JobPick>({ projectId: asset.holder.projectId ?? "", area: "" });
  const [note, setNote] = useState("");
  const action = useAction();
  const ready = where === "STORE" ? !!store.trim() : where === "VEHICLE" ? !!van.trim() : !!job.projectId;
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title={`${moving ? "Move" : "Return"} Asset No. ${asset.number}`} description={moving ? `${asset.name}. Now: ${asset.holder.text}.` : asset.name}>
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              const label = where === "STORE" ? store : where === "VEHICLE" ? van : null;
              await api(`/assets/${asset.id}/return`, { body: { where, label, ...(where === "PROJECT" ? jobBody(job) : {}), note: note || null } });
              onDone();
            });
          }}
        >
          <Segmented
            label="Where is it now"
            value={where}
            onChange={setWhere}
            items={[
              { value: "STORE", label: "Workshop" },
              { value: "VEHICLE", label: "Van" },
              { value: "PROJECT", label: "Left on a job" },
            ]}
          />
          {where === "STORE" && (
            <>
              <Field label="Which store" list="asset-stores" value={store} onChange={(event) => setStore(event.target.value)} hint="Workshop, yard, container… Type a new one if it's somewhere else." />
              <datalist id="asset-stores">{places?.stores.map((entry) => <option key={entry} value={entry} />)}</datalist>
            </>
          )}
          {where === "VEHICLE" && (
            <>
              <Field label="Which van" list="asset-vans" placeholder="e.g. Van 3, Sam's ute" value={van} onChange={(event) => setVan(event.target.value)} autoFocus />
              <datalist id="asset-vans">{places?.vans.map((entry) => <option key={entry} value={entry} />)}</datalist>
            </>
          )}
          {where === "PROJECT" && places && <JobPicker places={places} value={job} onChange={setJob} optional={false} />}
          <Note value={note} onChange={setNote} />
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={action.busy || !ready}>
              <LogIn /> {moving ? "Move it" : "Return it"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function TakeOverSheet({ asset, onClose, onDone }: { asset: AssetJson; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const action = useAction();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title={`Take over Asset No. ${asset.number}`} description={`${asset.holder.text}. It moves to you, staying on the same job. ${asset.holder.userName ?? "They"} will see it in the history.`}>
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api(`/assets/${asset.id}/take-over`, { body: { note: note || null } });
              onDone();
            });
          }}
        >
          <Note value={note} onChange={setNote} />
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={action.busy}>
              <Hand /> Take it over
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

const BLOCKED: Partial<Record<AssetJson["status"], string>> = {
  OUT_OF_SERVICE: "Do not use: fault reported",
  IN_REPAIR: "In for repair",
  RETIRED: "Retired",
  LOST: "Reported lost",
};

export function CustodyActions({ asset, userId, canAssign, solo }: { asset: AssetJson; userId: string; canAssign: boolean; solo: boolean }) {
  const [open, setOpen] = useState<"out" | "return" | "move" | "take" | null>(null);
  const done = () => window.location.reload();
  const blocked = BLOCKED[asset.status];
  const withPerson = asset.holder.kind === "USER";
  const mine = withPerson && asset.holder.userId === userId;

  return (
    <section className="flex flex-col gap-2" aria-label="Actions">
      <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">Actions</h2>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {mine ? (
          <Button size="lg" onClick={() => setOpen("return")}>
            <LogIn /> Return
          </Button>
        ) : withPerson && !blocked ? (
          <Button size="lg" onClick={() => setOpen("take")}>
            <Hand /> Take over
          </Button>
        ) : (
          <div className="flex flex-col gap-1">
            <Button size="lg" disabled={!!blocked} onClick={() => setOpen("out")}>
              <LogOut /> Check out
            </Button>
            {blocked && <p className="text-sm font-semibold text-destructive">{blocked}</p>}
          </div>
        )}
        {canAssign && (
          <Button size="lg" variant="outline" onClick={() => setOpen(withPerson && !mine && !blocked ? "out" : "move")}>
            <ArrowRightLeft /> {withPerson && !mine && !blocked && !solo ? "Give to someone" : "Move"}
          </Button>
        )}
      </div>
      {open === "out" && <CheckOutSheet asset={asset} canAssign={canAssign} solo={solo} onClose={() => setOpen(null)} onDone={done} />}
      {(open === "return" || open === "move") && <ReturnSheet asset={asset} moving={open === "move"} onClose={() => setOpen(null)} onDone={done} />}
      {open === "take" && <TakeOverSheet asset={asset} onClose={() => setOpen(null)} onDone={done} />}
    </section>
  );
}
