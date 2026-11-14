"use client";

// Buildings and levels of a site (docs/stage-2-projects.md §1a).
// Only the company that looks after the site can change them. Every level in
// a building needs its own name and short name (the server checks too).
// A floor can be deleted (the bin on its row) only when nothing is filed to it.

import { useState, type ReactNode } from "react";
import { Car, Trash2 } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  FormActions,
  Icon,
  List,
  PageHeader,
  Section,
  SelectField,
  Sheet,
  SheetContent,
  Stack,
  api,
  useAction,
} from "@grid/ui";
import { LEVEL_USES, basementAsParking, levelKey, levelNameClashes, levelShortName, standardLevels, type BelowGround } from "../address";
import type { SiteStructure } from "../service";

type Building = SiteStructure["buildings"][number];
type Level = Building["levels"][number];

export function StructureEditor({ initial, canEdit }: { initial: SiteStructure; canEdit: boolean }) {
  const [site, setSite] = useState(initial);
  const action = useAction();

  const reload = async () => setSite(await api<SiteStructure>(`/sites/${site.id}`));
  const run = (callback: () => Promise<unknown>) => action.run(async () => (await callback(), await reload(), true));

  const editable = canEdit && site.ownedByMe;

  return (
    <>
      <PageHeader
        title="Buildings & levels"
        meta={site.name}
        subtitle={
          site.kind === "PRIVATE"
            ? "Add a granny flat, a shed or a second storey. Existing jobs stay where they are."
            : "Set the site out once. Jobs then tick the buildings and levels they work on."
        }
      />
      <Stack>
        {!editable && <Alert>Only the company that looks after this site can change its buildings and levels.</Alert>}
        <Alert variant="error">{action.error}</Alert>
        {site.buildings.map((building) => (
          <BuildingCard key={building.id} building={building} editable={editable} busy={action.busy} run={run} />
        ))}
        {editable && <AddBuilding siteId={site.id} busy={action.busy} run={run} />}
        <div>
          <Button asChild variant="outline" size="lg" block>
            <a href={`/sites/${site.id}`}>Back to the site</a>
          </Button>
        </div>
      </Stack>
    </>
  );
}

type Run = (callback: () => Promise<unknown>) => Promise<boolean | undefined>;

function BuildingCard({ building, editable, busy, run }: { building: Building; editable: boolean; busy: boolean; run: Run }) {
  const [adding, setAdding] = useState(false);
  // Levels named the same from before names had to be different.
  const repeated = levelNameClashes([], building.levels.map((level) => level.name));
  const basements = building.levels.filter((level) => basementAsParking(level.name));
  return (
    <Section
      title={building.name}
      description={building.kind === "SINGLE" ? "Single-level" : `${building.levels.length} level${building.levels.length === 1 ? "" : "s"}`}
      flush
      actions={
        editable ? (
          <RenameButton label="Rename building" current={building.name} onSave={(name) => run(() => api(`/sites/buildings/${building.id}`, { method: "PATCH", body: { name } }))} />
        ) : undefined
      }
    >
      {repeated.length > 0 && (
        <div className="px-4 pb-3 sm:px-5">
          <Alert variant="error">
            More than one level is called {repeated.map((name) => `"${name}"`).join(", ")}. Rename them so each level has its own name.
          </Alert>
        </div>
      )}
      {building.kind === "MULTI" && building.levels.length > 0 && (
        <List>
          {building.levels.map((level, index) => (
            <LevelRow key={level.id} level={level} others={building.levels.filter((other) => other.id !== level.id)} first={index === 0} last={index === building.levels.length - 1} editable={editable} busy={busy} run={run} />
          ))}
        </List>
      )}
      {editable && (
        <div className="flex flex-col gap-2 px-4 pt-2 pb-4 sm:flex-row sm:px-5">
          {building.kind === "SINGLE" ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => run(() => api(`/sites/buildings/${building.id}/convert`, { method: "POST", body: {} }))}
            >
              <Icon name="layers" /> Give it levels
            </Button>
          ) : (
            <Button variant="outline" disabled={busy} onClick={() => setAdding(true)}>
              <Icon name="plus" /> Add levels
            </Button>
          )}
          {building.kind === "MULTI" && basements.length > 0 && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                const list = basements.map((level) => `${level.name} → ${basementAsParking(level.name)}`).join("\n");
                if (window.confirm(`Make the basements car parking levels?\n\n${list}`)) void run(() => api(`/sites/buildings/${building.id}/parking`, { body: {} }));
              }}
            >
              <Car /> Basements are parking
            </Button>
          )}
        </div>
      )}
      <AddLevelsSheet open={adding} onOpenChange={setAdding} building={building} run={run} />
    </Section>
  );
}

function LevelRow({
  level,
  others,
  first,
  last,
  editable,
  busy,
  run,
}: {
  level: Level;
  /** The building's other levels (their names and short names are taken). */
  others: Level[];
  first: boolean;
  last: boolean;
  editable: boolean;
  busy: boolean;
  run: Run;
}) {
  const move = (direction: "up" | "down") => run(() => api(`/sites/levels/${level.id}/move`, { body: { direction } }));
  return (
    <li className="flex min-h-touch-lg items-center gap-3 px-4 py-2 sm:px-5">
      <span className="w-12 shrink-0 rounded-md bg-muted py-1 text-center text-sm font-bold">{level.shortName}</span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{level.name}</span>
        {level.use && <span className="text-muted-foreground"> · {level.use}</span>}
      </span>
      {editable && (
        <span className="flex shrink-0 items-center">
          <Button variant="ghost" size="icon" aria-label={`Move ${level.name} up`} disabled={busy || first} onClick={() => move("up")}>
            <Icon name="arrow-up" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Move ${level.name} down`} disabled={busy || last} onClick={() => move("down")}>
            <Icon name="arrow-down" />
          </Button>
          <RenameButton
            label={`Rename ${level.name}`}
            current={level.name}
            extra={level.shortName}
            use={level.use}
            problem={(name, short) => {
              const sameName = others.find((other) => levelKey(other.name) === levelKey(name));
              if (sameName) return `There's already a level called "${sameName.name}" in this building. Give each level its own name.`;
              const sameShort = short.trim() && others.find((other) => other.shortName.toLowerCase() === short.trim().toLowerCase());
              if (sameShort) return `"${sameShort.name}" already uses the short name "${sameShort.shortName}". Pick another.`;
              return null;
            }}
            onSave={(name, shortName, use) => run(() => api(`/sites/levels/${level.id}`, { method: "PATCH", body: { name, shortName, use: use?.trim() || null } }))}
          />
          <DeleteLevel level={level} busy={busy} run={run} />
        </span>
      )}
    </li>
  );
}

function RenameButton({
  label,
  current,
  extra,
  use,
  problem,
  onSave,
  children,
}: {
  label: string;
  current: string;
  /** Short name for levels ("L5"). */
  extra?: string;
  /** What a level is used for ("Plant room"); levels only. */
  use?: string | null;
  /** Why the name can't be saved (e.g. another level has it), or null. */
  problem?: (name: string, shortName: string) => string | null;
  onSave: (name: string, shortName?: string, use?: string) => Promise<unknown>;
  /** More under the form (e.g. Delete level). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(current);
  const [short, setShort] = useState(extra ?? "");
  const [usedFor, setUsedFor] = useState(use ?? "");
  const issue = name.trim() ? (problem?.(name, short) ?? null) : null;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" aria-label={label} onClick={() => (setName(current), setShort(extra ?? ""), setUsedFor(use ?? ""), setOpen(true))}>
        <Icon name="edit" />
      </Button>
      <SheetContent title={label}>
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (issue) return;
            if (await onSave(name, extra !== undefined ? short : undefined, extra !== undefined ? usedFor : undefined)) setOpen(false);
          }}
        >
          <Field
            label="Name"
            value={name}
            onChange={(event) => {
              const next = event.target.value;
              // Keep the short name in step while it's still the one worked out from the name ("Parking 2" → P2).
              if (extra !== undefined && (short === extra || short === levelShortName(name))) setShort(levelShortName(next));
              setName(next);
            }}
            required
          />
          {extra !== undefined && (
            <Field label="Short name" hint="Shown in breadcrumbs on phones, e.g. L5" maxLength={8} value={short} onChange={(event) => setShort(event.target.value)} />
          )}
          {extra !== undefined && <UsedForField value={usedFor} onChange={setUsedFor} />}
          <Alert variant="error">{issue}</Alert>
          <FormActions>
            <Button type="submit" size="lg" disabled={!!issue}>Save</Button>
          </FormActions>
        </form>
        {children}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The bin on a floor's row. Opens a sheet that asks the server what's filed
 * to the floor: an empty floor can go (after a confirm); otherwise it says
 * what's there.
 */
function DeleteLevel({ level, busy, run }: { level: Level; busy: boolean; run: Run }) {
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<{ inUse: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const start = async () => {
    setOpen(true);
    setCheck(null);
    setError(null);
    try {
      setCheck(await api<{ name: string; inUse: string[] }>(`/sites/levels/${level.id}/usage`));
    } catch (failure) {
      setError((failure as Error).message);
    }
  };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" aria-label={`Delete ${level.name}`} title={`Delete ${level.name}`} disabled={busy} onClick={() => void start()} className="text-muted-foreground hover:text-destructive">
        <Trash2 />
      </Button>
      <SheetContent title={`Delete ${level.name}?`}>
        <div className="flex flex-col gap-4 px-2">
          {!check && !error && <p className="text-muted-foreground">Checking what&apos;s on {level.name}…</p>}
          {check && check.inUse.length > 0 && (
            <>
              <Alert variant="error">
                {level.name} can&apos;t be deleted: it still has {check.inUse.join(", ")}. Move or remove them first, then try again.
              </Alert>
              <FormActions>
                <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)}>
                  OK
                </Button>
              </FormActions>
            </>
          )}
          {check && check.inUse.length === 0 && (
            <>
              <p>Nothing is filed to {level.name}. Delete it? This can&apos;t be undone.</p>
              <FormActions>
                <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)}>
                  Keep it
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    setError(null);
                    try {
                      await api(`/sites/levels/${level.id}`, { method: "DELETE" });
                      setOpen(false);
                      await run(async () => undefined); // reload the buildings
                    } catch (failure) {
                      setError((failure as Error).message);
                    } finally {
                      setDeleting(false);
                    }
                  }}
                >
                  {deleting ? "Deleting…" : `Delete ${level.name}`}
                </Button>
              </FormActions>
            </>
          )}
          <Alert variant="error">{error}</Alert>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** "Used for": Plant room, Retail… (suggested; any words are fine). The level keeps its number as its name. */
function UsedForField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <>
      <Field
        label="Used for (optional)"
        hint="e.g. Level 40 used for Plant room. Shows as “Level 40 · Plant room”."
        placeholder="e.g. Plant room"
        list="level-uses"
        autoComplete="off"
        maxLength={40}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id="level-uses">
        {LEVEL_USES.map((use) => (
          <option key={use} value={use} />
        ))}
      </datalist>
    </>
  );
}

function AddLevelsSheet({ open, onOpenChange, building, run }: { open: boolean; onOpenChange: (open: boolean) => void; building: Building; run: Run }) {
  const empty = building.levels.length === 0;
  // A building that's just been given levels has only "Ground": still a good time for the full set.
  const onlyGround = building.levels.length === 1 && levelKey(building.levels[0]!.name) === "ground";
  const [mode, setMode] = useState<"standard" | "one">(empty || onlyGround ? "standard" : "one");
  const [above, setAbove] = useState("3");
  const [basements, setBasements] = useState("0");
  const [below, setBelow] = useState<BelowGround>("basement");
  const [roof, setRoof] = useState(true);
  const [name, setName] = useState("");
  const [position, setPosition] = useState<"above" | "below">("above");
  const [usedFor, setUsedFor] = useState("");

  const fullSet = standardLevels({ above: Math.max(0, Math.min(150, Number(above) || 0)), basements: Math.max(0, Math.min(10, Number(basements) || 0)), roof, below });
  // The full set skips floors the building already has (usually "Ground", made when it was given levels):
  // the rest go above the top floor (Level 1 up, Roof) or below the bottom one (basements, parking).
  const existing = new Set(building.levels.map((level) => levelKey(level.name)));
  const groundAt = fullSet.findIndex((level) => levelKey(level) === "ground");
  const already = fullSet.filter((level) => existing.has(levelKey(level)));
  const newAbove = fullSet.slice(0, groundAt).filter((level) => !existing.has(levelKey(level)));
  const newBelow = fullSet.slice(groundAt).filter((level) => !existing.has(levelKey(level)));
  const names = mode === "standard" ? [...newAbove, ...newBelow] : name.trim() ? [name.trim()] : [];
  const clashes = levelNameClashes(
    building.levels.map((level) => level.name),
    names,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={`Add levels to ${building.name}`}>
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const add = (levels: string[], where: "above" | "below", use?: string) =>
              api(`/sites/buildings/${building.id}/levels`, { body: { names: levels, position: where, ...(use ? { use } : {}) } });
            const ok = await run(async () => {
              if (mode === "one") return add(names, position, usedFor.trim() || undefined);
              // An empty building takes the whole stack at once; otherwise above the top and below the bottom.
              if (empty) return add(names, "above");
              if (newAbove.length) await add(newAbove, "above");
              if (newBelow.length) await add(newBelow, "below");
            });
            if (ok) {
              onOpenChange(false);
              setName("");
              setUsedFor("");
            }
          }}
        >
          <SelectField
            label="What to add"
            value={mode}
            onChange={(event) => setMode(event.target.value as "standard" | "one")}
            options={[
              { value: "standard", label: "A full set of floors" },
              { value: "one", label: "One level (mezzanine, plant room…)" },
            ]}
          />
          {mode === "standard" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Levels above ground" inputMode="numeric" value={above} onChange={(event) => setAbove(event.target.value)} />
                <Field label="Levels below ground" inputMode="numeric" value={basements} onChange={(event) => setBasements(event.target.value)} />
              </div>
              {Number(basements) > 0 && (
                <SelectField
                  label="Below ground are"
                  value={below}
                  onChange={(event) => setBelow(event.target.value as BelowGround)}
                  options={[
                    { value: "basement", label: "Basements (B1, B2…)" },
                    { value: "parking", label: "Car parking (P1, P2…)" },
                  ]}
                />
              )}
              <label className="flex min-h-touch items-center gap-3">
                <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={roof} onChange={(event) => setRoof(event.target.checked)} />
                Include a roof level
              </label>
              <p className="text-sm text-muted-foreground">
                {names.length ? `Adds: ${names.join(", ")}` : "All of these are already there."}
                {already.length > 0 && names.length > 0 && ` (${already.join(", ")} ${already.length === 1 ? "is" : "are"} already there)`}
              </p>
            </>
          ) : (
            <>
              <Field label="Level name" placeholder="e.g. Level 40, Mezzanine, Parking 3" value={name} onChange={(event) => setName(event.target.value)} required />
              <UsedForField value={usedFor} onChange={setUsedFor} />
              {!empty && (
                <SelectField
                  label="Where"
                  value={position}
                  onChange={(event) => setPosition(event.target.value as "above" | "below")}
                  options={[
                    { value: "above", label: `Above ${building.levels[0]!.name}` },
                    { value: "below", label: `Below ${building.levels.at(-1)!.name}` },
                  ]}
                  hint="You can move it up or down afterwards."
                />
              )}
            </>
          )}
          {clashes.length > 0 && (
            <Alert variant="error">
              {building.name} already has {clashes.length === 1 ? "a level" : "levels"} called {clashes.map((clash) => `"${clash}"`).join(", ")}. Every level needs its own name
              {mode === "standard" ? ": add one level at a time instead, or rename the existing ones first." : "."}
            </Alert>
          )}
          <FormActions>
            <Button type="submit" size="lg" disabled={names.length === 0 || clashes.length > 0}>
              Add {names.length === 1 ? "level" : `${names.length} levels`}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function AddBuilding({ siteId, busy, run }: { siteId: string; busy: boolean; run: Run }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"SINGLE" | "MULTI">("SINGLE");
  return (
    <Section title="Add a building" description="A granny flat, a shed, Building B, a car park.">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await run(() => api(`/sites/${siteId}/buildings`, { body: { name, kind } }))) setName("");
        }}
      >
        <Field label="Building name" value={name} onChange={(event) => setName(event.target.value)} required />
        <SelectField
          label="Levels"
          value={kind}
          onChange={(event) => setKind(event.target.value as "SINGLE" | "MULTI")}
          options={[
            { value: "SINGLE", label: "Single-level (no floors to pick)" },
            { value: "MULTI", label: "Multi-level (add floors next)" },
          ]}
        />
        <FormActions>
          <Button type="submit" size="lg" disabled={busy}>
            <Icon name="plus" /> Add building
          </Button>
        </FormActions>
      </form>
    </Section>
  );
}

