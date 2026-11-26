"use client";

// Inspections and servicing on an asset's page (docs/assets-block.md §4),
// laid out like Docket's Service card: Routines (each with how often, when
// it's next due, a booking), then the Log (each test, inspection or
// service done), then "Checked ▾" (today, earlier, book one in) and Add
// routine. A category's routines show here too, changed in Settings ›
// Asset categories.
import { useRef, useState } from "react";
import { CalendarCheck, CalendarClock, CalendarX, Camera, Check, ChevronDown, FileText, FileUp, History, MoreHorizontal, Paperclip, Pencil, ShieldCheck, Trash2, Wrench, X } from "lucide-react";
import {
  Alert,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuDetail,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Section,
  Segmented,
  Sheet,
  SheetContent,
  Switch,
  api,
  cn,
  useAction,
} from "@grid/ui";
import { Chip, Pill, SubHeading, TextArea, dayText, photoUrl, todayHere, uploadPhoto, type DueJson } from "./shared";

export interface RoutineJson {
  id: string;
  name: string;
  everyMonths: number | null;
  mustPass: boolean;
  notes: string | null;
  from: string | null;
  interval: string;
  due: DueJson;
  lastDone: string | null;
  booked: { id: string; date: string; withWho: string | null; past: boolean } | null;
}

export interface CheckJson {
  id: string;
  date: string;
  title: string;
  routineIds: string[];
  result: "PASS" | "FAIL";
  doneBy: string | null;
  tagColour: string | null;
  cost: string | null;
  fileIds: string[];
  files: { id: string; name: string; image: boolean }[];
  notes: string | null;
  faultId: string | null;
  by: string;
}

export interface ServiceJson {
  enabled: boolean;
  routines: RoutineJson[];
  checks: CheckJson[];
}

/** Test & tag colours as theme colours: red, green, blue, yellow. */
const TAG_TONE: Record<string, string> = { RED: "bg-destructive", GREEN: "bg-success", BLUE: "bg-info", YELLOW: "bg-warning" };
const TAG_WORDS: Record<string, string> = { RED: "Red", GREEN: "Green", BLUE: "Blue", YELLOW: "Yellow" };
const testAndTag = (name: string) => /test\s*(&|and|n)\s*tag/i.test(name);
/** AS/NZS 3760 colours by season, as the server works them out (due.ts). */
const tagColourFor = (day: string) => {
  const month = Number(day.slice(5, 7));
  return month === 12 || month <= 2 ? "RED" : month <= 5 ? "GREEN" : month <= 8 ? "BLUE" : "YELLOW";
};
const money = (amount: string) => Number(amount).toLocaleString("en-AU", { style: "currency", currency: "AUD" });

type NewCheck = { new: true; date: string | null; routineIds: string[] };

export function ServiceCard({ assetId, assetName, data, canManage, canRecord }: { assetId: string; assetName: string; data: ServiceJson; canManage: boolean; canRecord: boolean }) {
  const [routine, setRoutine] = useState<RoutineJson | "new" | null>(null);
  const [check, setCheck] = useState<CheckJson | NewCheck | null>(null);
  const [booking, setBooking] = useState(false);
  const action = useAction();
  const reload = () => window.location.reload();
  const routineName = (id: string) => data.routines.find((entry) => entry.id === id)?.name;
  const cancel = (bookingId: string) => void action.run(async () => (await api(`/assets/${assetId}/bookings/${bookingId}`, { method: "DELETE" }), reload()));
  const mustPass = data.routines.some((entry) => entry.mustPass);

  return (
    <Section
      title="Inspections and servicing"
      description={mustPass ? "Tests and inspections it must pass, regular care, and every one done." : "Regular care, like test & tag or an annual service, and when it was done."}
    >
      <div className="flex flex-col gap-5">
        {/* Routines */}
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold">Routines</h3>
          {data.routines.length ? (
            <ul className="flex flex-col">
              {data.routines.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 border-t py-3 first:border-t-0">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", entry.mustPass ? "bg-accent text-accent-foreground" : "bg-muted")}>
                    {entry.mustPass ? <ShieldCheck className="size-5" /> : <Wrench className="size-5" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-bold">{entry.name}</span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {[entry.interval, entry.mustPass ? "Must pass to use it" : null, entry.from ? `From ${entry.from}` : null].filter(Boolean).join(" · ")}
                    </span>
                    <Chip tone={entry.due.tone} className="self-start">
                      {entry.due.text}
                    </Chip>
                    {entry.booked && !entry.booked.past && (
                      <span className="flex items-center gap-1.5 text-xs font-semibold">
                        <CalendarCheck className="size-3.5 shrink-0" />
                        Booked {dayText(entry.booked.date)}
                        {entry.booked.withWho && <span className="font-medium text-muted-foreground">· {entry.booked.withWho}</span>}
                      </span>
                    )}
                    {entry.lastDone && (
                      <span className="text-xs font-medium">
                        <span className="font-semibold">Last done:</span> <span className="text-muted-foreground">{dayText(entry.lastDone)}</span>
                      </span>
                    )}
                    {entry.booked?.past && canRecord && (
                      <span className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <span className="text-xs font-semibold">
                          Booked {dayText(entry.booked.date)}
                          {entry.booked.withWho ? ` with ${entry.booked.withWho}` : ""}. Was it done?
                        </span>
                        <span className="flex flex-wrap gap-2">
                          <Button onClick={() => setCheck({ new: true, date: entry.booked!.date, routineIds: [entry.id] })}>
                            <Check /> Yes, log it
                          </Button>
                          <Button variant="outline" disabled={action.busy} onClick={() => cancel(entry.booked!.id)}>
                            <CalendarX /> It didn&apos;t happen
                          </Button>
                        </span>
                      </span>
                    )}
                  </span>
                  {((canManage && !entry.from) || (canRecord && entry.booked)) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Options for ${entry.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-52">
                        {canManage && !entry.from && (
                          <DropdownMenuItem onSelect={() => setRoutine(entry)}>
                            <Pencil /> Edit routine
                          </DropdownMenuItem>
                        )}
                        {canRecord && entry.booked && (
                          <DropdownMenuItem onSelect={() => cancel(entry.booked!.id)}>
                            <CalendarX /> Cancel booking
                          </DropdownMenuItem>
                        )}
                        {canManage && !entry.from && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => {
                                if (!window.confirm(`Remove ${entry.name}? Its past checks stay in the log.`)) return;
                                void action.run(async () => (await api(`/assets/${assetId}/routines/${entry.id}`, { method: "DELETE" }), reload()));
                              }}
                            >
                              <Trash2 /> Remove
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-1 text-sm text-muted-foreground">No routines yet. Add one, like test & tag every 3 months, to see when it&apos;s next due.</p>
          )}
        </div>

        {/* Log */}
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold">Log</h3>
          {data.checks.length ? (
            <ul className="flex flex-col">
              {data.checks.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 border-t py-3 first:border-t-0">
                  <span className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-muted py-1.5 text-center leading-tight">
                    <span className="font-bold tabular-nums">{new Date(`${entry.date}T00:00:00Z`).getUTCDate()}</span>
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                      {new Date(`${entry.date}T00:00:00Z`).toLocaleDateString("en-AU", { month: "short", year: "2-digit", timeZone: "UTC" })}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-bold">{entry.title}</span>
                    <span className="text-xs font-medium text-muted-foreground">{[entry.doneBy, `logged by ${entry.by}`].filter(Boolean).join(" · ")}</span>
                    <span className="flex flex-wrap gap-1.5">
                      <Chip tone={entry.result === "PASS" ? "ok" : "overdue"}>{entry.result === "PASS" ? "Passed" : "Failed"}</Chip>
                      {entry.tagColour && (
                        <Chip>
                          <span aria-hidden className={cn("size-2.5 rounded-full", TAG_TONE[entry.tagColour])} />
                          {TAG_WORDS[entry.tagColour]} tag
                        </Chip>
                      )}
                      {entry.routineIds.map((id) => (routineName(id) ? <Chip key={id}>{routineName(id)}</Chip> : null))}
                      {entry.files.length > 0 && (
                        <Chip title={entry.files.map((file) => file.name).join(", ")}>
                          <Paperclip /> {entry.files.length}
                        </Chip>
                      )}
                    </span>
                    {entry.notes && <span className="text-sm whitespace-pre-line">{entry.notes}</span>}
                    {entry.files.length > 0 && <Files files={entry.files} />}
                  </span>
                  {entry.cost && <span className="font-bold tabular-nums">{money(entry.cost)}</span>}
                  {canRecord && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Options for ${entry.title}, ${dayText(entry.date)}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-48">
                        <DropdownMenuItem onSelect={() => setCheck(entry)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => {
                            if (!window.confirm(`Delete "${entry.title}" on ${dayText(entry.date)}? It comes out of the log and its files go.${entry.faultId ? " The fault it opened stays." : ""}`)) return;
                            void action.run(async () => (await api(`/assets/${assetId}/checks/${entry.id}`, { method: "DELETE" }), reload()));
                          }}
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-1 text-sm text-muted-foreground">Nothing logged yet.</p>
          )}
        </div>

        {(canRecord || canManage) && (
          <div className="flex flex-wrap gap-2">
            {canRecord && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <Check /> Checked <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuItem onSelect={() => setCheck({ new: true, date: todayHere(), routineIds: [] })}>
                    <Check />
                    <DropdownMenuDetail title="Checked today" detail="Log it with today's date" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCheck({ new: true, date: null, routineIds: [] })}>
                    <History />
                    <DropdownMenuDetail title="Checked earlier" detail="Log a past one, on its date" />
                  </DropdownMenuItem>
                  {data.routines.length > 0 && (
                    <DropdownMenuItem onSelect={() => setBooking(true)}>
                      <CalendarClock />
                      <DropdownMenuDetail title="Book it in" detail="One coming up that's booked" />
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canManage && (
              <Button variant="outline" onClick={() => setRoutine("new")}>
                <Wrench /> Add routine
              </Button>
            )}
          </div>
        )}
        <Alert variant="error">{action.error}</Alert>
      </div>
      {routine && <RoutineSheet assetId={assetId} routine={routine} onClose={() => setRoutine(null)} />}
      {check && <CheckSheet assetId={assetId} assetName={assetName} check={check} routines={data.routines} onClose={() => setCheck(null)} />}
      {booking && <BookSheet assetId={assetId} assetName={assetName} routines={data.routines} onClose={() => setBooking(false)} />}
    </Section>
  );
}

function Files({ files }: { files: CheckJson["files"] }) {
  return (
    <span className="flex flex-wrap gap-2">
      {files.map((file) =>
        file.image ? (
          <a key={file.id} href={photoUrl(file.id, "original")} className="overflow-hidden rounded-lg" title={file.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(file.id, "thumb")} alt={file.name} className="size-14 object-cover" />
          </a>
        ) : (
          <a key={file.id} href={`/api/files/${file.id}`} className="flex min-h-touch max-w-56 items-center gap-2 rounded-lg bg-muted px-3 text-sm font-semibold hover:bg-accent">
            <FileText className="size-4 shrink-0" />
            <span className="truncate">{file.name}</span>
          </a>
        ),
      )}
    </span>
  );
}

const ROUTINE_NAMES = ["Test & tag", "Height safety inspection", "Ladder inspection", "Annual service", "Calibration"];

export function RoutineFields({ value, onChange }: { value: { name: string; everyMonths: string; mustPass: boolean; notes: string }; onChange: (value: { name: string; everyMonths: string; mustPass: boolean; notes: string }) => void }) {
  const set = (changes: Partial<typeof value>) => onChange({ ...value, ...changes });
  return (
    <>
      <Field label="Name" value={value.name} onChange={(event) => set({ name: event.target.value })} placeholder="Test & tag" autoFocus />
      <div className="flex flex-wrap gap-2">
        {ROUTINE_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => set({ name, ...(name === "Test & tag" ? { everyMonths: value.everyMonths || "3", mustPass: true } : name === "Height safety inspection" ? { everyMonths: value.everyMonths || "6", mustPass: true } : {}) })}
            className="min-h-touch rounded-full border border-input bg-card px-3 text-xs font-semibold hover:bg-muted"
          >
            {name}
          </button>
        ))}
      </div>
      <Field label="Every (months)" inputMode="numeric" placeholder="3" value={value.everyMonths} onChange={(event) => set({ everyMonths: event.target.value.replace(/\D/g, "") })} hint="Construction sites: test & tag every 3 months (AS/NZS 3760)." />
      <label className="flex min-h-touch-lg cursor-pointer items-center gap-3 rounded-xl bg-muted px-3.5 py-3">
        <Switch checked={value.mustPass} onCheckedChange={(checked) => set({ mustPass: checked })} />
        <span className="flex flex-col gap-0.5">
          <b className="text-sm">Must pass to use it</b>
          <span className="text-xs text-muted-foreground">Once it&apos;s overdue, or it fails, it can&apos;t be checked out until a pass is logged. For test & tag and safety inspections.</span>
        </span>
      </label>
      <TextArea id="routine-notes" label="Notes (optional)" value={value.notes} onChange={(notes) => set({ notes })} placeholder="What the test covers, who usually does it" />
    </>
  );
}

function RoutineSheet({ assetId, routine, onClose }: { assetId: string; routine: RoutineJson | "new"; onClose: () => void }) {
  const editing = routine !== "new" ? routine : null;
  const [value, setValue] = useState({ name: editing?.name ?? "", everyMonths: editing?.everyMonths ? String(editing.everyMonths) : "", mustPass: editing?.mustPass ?? false, notes: editing?.notes ?? "" });
  const action = useAction();
  const save = () =>
    void action.run(async () => {
      const body = { name: value.name, everyMonths: value.everyMonths ? Number(value.everyMonths) : null, mustPass: value.mustPass, notes: value.notes || null };
      await api(editing ? `/assets/${assetId}/routines/${editing.id}` : `/assets/${assetId}/routines`, { method: editing ? "PUT" : "POST", body });
      window.location.reload();
    });
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        title={editing ? "Edit routine" : "Add routine"}
        description="How often it needs doing, and whether it must pass before anyone uses it."
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={action.busy || !value.name.trim()} onClick={save}>
              {editing ? "Save" : "Add routine"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 px-2">
          <RoutineFields value={value} onChange={setValue} />
          <Alert variant="error">{action.error}</Alert>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CheckSheet({ assetId, assetName, check, routines, onClose }: { assetId: string; assetName: string; check: CheckJson | NewCheck; routines: RoutineJson[]; onClose: () => void }) {
  const editing = "new" in check ? null : check;
  const first = routines.find((entry) => entry.id === check.routineIds[0]);
  const [form, setForm] = useState({
    date: editing?.date ?? (check as NewCheck).date ?? "",
    routineIds: check.routineIds,
    title: editing?.title ?? first?.name ?? "",
    result: editing?.result ?? ("PASS" as "PASS" | "FAIL"),
    doneBy: editing?.doneBy ?? "",
    tagColour: editing?.tagColour ?? null,
    cost: editing?.cost ?? "",
    notes: editing?.notes ?? "",
  });
  const [files, setFiles] = useState<CheckJson["files"]>(editing?.files ?? []);
  const [uploading, setUploading] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const action = useAction();
  const set = (changes: Partial<typeof form>) => setForm((current) => ({ ...current, ...changes }));
  const coveredNames = routines.filter((entry) => form.routineIds.includes(entry.id)).map((entry) => entry.name);
  const tagged = coveredNames.some(testAndTag) || testAndTag(form.title);
  const colour = form.tagColour ?? (form.date ? tagColourFor(form.date) : null);

  const toggle = (id: string) => {
    const on = form.routineIds.includes(id);
    const ids = on ? form.routineIds.filter((entry) => entry !== id) : [...form.routineIds, id];
    // The first routine picked also names it, if it has no name yet.
    set({ routineIds: ids, title: !on && !form.title.trim() ? (routines.find((entry) => entry.id === id)?.name ?? form.title) : form.title });
  };

  const add = async (list: FileList | null) => {
    const picked = [...(list ?? [])];
    if (!picked.length) return;
    setUploading(true);
    action.setError(null);
    try {
      const added: CheckJson["files"] = [];
      for (const file of picked) added.push({ id: await uploadPhoto(file), name: file.name, image: file.type.startsWith("image/") });
      setFiles((current) => [...current, ...added]);
    } catch (failure) {
      action.setError((failure as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const save = () =>
    void action.run(async () => {
      const body = { ...form, tagColour: tagged ? colour : null, doneBy: form.doneBy || null, cost: form.cost || null, notes: form.notes || null, fileIds: files.map((file) => file.id) };
      await api(editing ? `/assets/${assetId}/checks/${editing.id}` : `/assets/${assetId}/checks`, { method: editing ? "PUT" : "POST", body });
      window.location.reload();
    });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        title={editing ? "Edit check" : "Log a check"}
        description={editing ? undefined : `A test, inspection or service done to ${assetName}.`}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button variant={form.result === "FAIL" && !editing ? "destructive" : "default"} disabled={action.busy || uploading || !form.title.trim() || !form.date} onClick={save}>
              {editing ? "Save" : form.result === "FAIL" ? "Log the fail" : "Log it"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 px-2">
          {routines.length > 0 && (
            <div role="group" aria-label="Routines covered" className="flex flex-col gap-2">
              <span className="text-sm font-medium">Routines covered</span>
              <div className="flex flex-wrap gap-2">
                {routines.map((entry) => (
                  <Pill key={entry.id} on={form.routineIds.includes(entry.id)} onClick={() => toggle(entry.id)}>
                    {form.routineIds.includes(entry.id) && <Check />}
                    {entry.name}
                  </Pill>
                ))}
              </div>
            </div>
          )}
          <Field label="What was done" value={form.title} onChange={(event) => set({ title: event.target.value })} placeholder="Test & tag" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" type="date" max={todayHere()} value={form.date} onChange={(event) => set({ date: event.target.value })} />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Result</span>
              <Segmented
                label="Result"
                value={form.result}
                onChange={(result) => set({ result })}
                items={[
                  { value: "PASS", label: "Passed" },
                  { value: "FAIL", label: "Failed" },
                ]}
              />
            </div>
          </div>
          {form.result === "FAIL" && !editing?.faultId && (
            <p className="rounded-xl bg-destructive/15 px-3.5 py-3 text-sm font-semibold text-destructive">It&apos;s marked Do not use, with a Failed test fault, and Owners and Foremen are told.</p>
          )}
          {tagged && (
            <div role="group" aria-label="Tag colour" className="flex flex-col gap-2">
              <span className="text-sm font-medium">Tag colour</span>
              <div className="flex flex-wrap gap-2">
                {Object.keys(TAG_WORDS).map((key) => (
                  <Pill key={key} on={colour === key} onClick={() => set({ tagColour: key })}>
                    <span aria-hidden className={cn("size-3 rounded-full", TAG_TONE[key])} />
                    {TAG_WORDS[key]}
                  </Pill>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">Picked from the date: Red Dec–Feb, Green Mar–May, Blue Jun–Aug, Yellow Sep–Nov.</p>
            </div>
          )}

          <SubHeading title="Who and cost" />
          <Field label="Done by" value={form.doneBy} onChange={(event) => set({ doneBy: event.target.value })} placeholder="The tester or business, e.g. Spark Safe Testing" />
          <Field label="Cost (optional)" inputMode="decimal" placeholder="$" value={form.cost} onChange={(event) => set({ cost: event.target.value })} />

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Certificate, photos or invoice</span>
            {files.map((file) => (
              <div key={file.id} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
                <FileUp className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <button type="button" aria-label={`Take off ${file.name}`} onClick={() => setFiles(files.filter((entry) => entry.id !== file.id))} className="flex size-touch items-center justify-center rounded-full hover:bg-card">
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={uploading} onClick={() => camera.current?.click()}>
                <Camera /> Take photo
              </Button>
              <Button type="button" variant="outline" disabled={uploading} onClick={() => picker.current?.click()}>
                <FileUp /> {uploading ? "Uploading…" : "Upload"}
              </Button>
            </div>
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void add(event.target.files).then(() => (event.target.value = ""))} />
            <input ref={picker} type="file" accept="image/*,application/pdf" multiple hidden onChange={(event) => void add(event.target.files).then(() => (event.target.value = ""))} />
          </div>

          <TextArea id="check-notes" label="Notes (optional)" value={form.notes} onChange={(notes) => set({ notes })} placeholder="What failed, parts replaced, things to watch" />
          <Alert variant="error">{action.error}</Alert>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Book one in: the day it's booked for and where. It shows as the next date until it's logged. */
function BookSheet({ assetId, assetName, routines, onClose }: { assetId: string; assetName: string; routines: RoutineJson[]; onClose: () => void }) {
  const [date, setDate] = useState("");
  const [withWho, setWithWho] = useState("");
  // The first routine with an interval to start with; more can be ticked.
  const [picked, setPicked] = useState<string[]>(routines.filter((entry) => entry.everyMonths).map((entry) => entry.id).slice(0, 1));
  const action = useAction();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        title="Book it in"
        description={`A test or service for ${assetName} that's booked. It shows as the next date until you log it.`}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={action.busy || !date || !picked.length}
              onClick={() => void action.run(async () => (await api(`/assets/${assetId}/bookings`, { body: { routineIds: picked, date, withWho: withWho || null } }), window.location.reload()))}
            >
              <CalendarCheck /> Book
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 px-2">
          <div role="group" aria-label="Routines" className="flex flex-col gap-2">
            <span className="text-sm font-medium">For</span>
            <div className="flex flex-wrap gap-2">
              {routines.map((entry) => (
                <Pill key={entry.id} on={picked.includes(entry.id)} onClick={() => setPicked(picked.includes(entry.id) ? picked.filter((id) => id !== entry.id) : [...picked, entry.id])}>
                  {picked.includes(entry.id) && <Check />}
                  {entry.name}
                </Pill>
              ))}
            </div>
          </div>
          <Field label="Booked for" type="date" min={todayHere()} value={date} onChange={(event) => setDate(event.target.value)} />
          <Field label="Where or who (optional)" value={withWho} onChange={(event) => setWithWho(event.target.value)} placeholder="Spark Safe Testing, Dandenong" />
          <Alert variant="error">{action.error}</Alert>
        </div>
      </SheetContent>
    </Sheet>
  );
}
