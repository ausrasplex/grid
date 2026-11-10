"use client";

// Buildings and levels of a site (docs/stage-2-projects.md §1a).
// Only the company that looks after the site can change them.

import { useState } from "react";
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
import { standardLevels } from "../address";
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
            <a href={`/b/projects/site/${site.id}`}>Back to the site</a>
          </Button>
        </div>
      </Stack>
    </>
  );
}

type Run = (callback: () => Promise<unknown>) => Promise<boolean | undefined>;

function BuildingCard({ building, editable, busy, run }: { building: Building; editable: boolean; busy: boolean; run: Run }) {
  const [adding, setAdding] = useState(false);
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
      {building.kind === "MULTI" && building.levels.length > 0 && (
        <List>
          {building.levels.map((level, index) => (
            <LevelRow key={level.id} level={level} first={index === 0} last={index === building.levels.length - 1} editable={editable} busy={busy} run={run} />
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
        </div>
      )}
      <AddLevelsSheet open={adding} onOpenChange={setAdding} building={building} run={run} />
    </Section>
  );
}

function LevelRow({ level, first, last, editable, busy, run }: { level: Level; first: boolean; last: boolean; editable: boolean; busy: boolean; run: Run }) {
  const move = (direction: "up" | "down") => run(() => api(`/sites/levels/${level.id}/move`, { body: { direction } }));
  return (
    <li className="flex min-h-touch-lg items-center gap-3 px-4 py-2 sm:px-5">
      <span className="w-12 shrink-0 rounded-md bg-muted py-1 text-center text-sm font-bold">{level.shortName}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{level.name}</span>
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
            onSave={(name, shortName) => run(() => api(`/sites/levels/${level.id}`, { method: "PATCH", body: { name, shortName } }))}
          />
        </span>
      )}
    </li>
  );
}

function RenameButton({
  label,
  current,
  extra,
  onSave,
}: {
  label: string;
  current: string;
  /** Short name for levels ("L5"). */
  extra?: string;
  onSave: (name: string, shortName?: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(current);
  const [short, setShort] = useState(extra ?? "");
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" aria-label={label} onClick={() => (setName(current), setShort(extra ?? ""), setOpen(true))}>
        <Icon name="edit" />
      </Button>
      <SheetContent title={label}>
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await onSave(name, extra !== undefined ? short : undefined)) setOpen(false);
          }}
        >
          <Field label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
          {extra !== undefined && (
            <Field label="Short name" hint="Shown in breadcrumbs on phones, e.g. L5" maxLength={8} value={short} onChange={(event) => setShort(event.target.value)} />
          )}
          <FormActions>
            <Button type="submit" size="lg">Save</Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function AddLevelsSheet({ open, onOpenChange, building, run }: { open: boolean; onOpenChange: (open: boolean) => void; building: Building; run: Run }) {
  const empty = building.levels.length === 0;
  const [mode, setMode] = useState<"standard" | "one">(empty ? "standard" : "one");
  const [above, setAbove] = useState("3");
  const [basements, setBasements] = useState("0");
  const [roof, setRoof] = useState(true);
  const [name, setName] = useState("");
  const [position, setPosition] = useState<"above" | "below">("above");

  const names =
    mode === "standard"
      ? standardLevels({ above: Math.max(0, Math.min(150, Number(above) || 0)), basements: Math.max(0, Math.min(10, Number(basements) || 0)), roof })
      : name.trim()
        ? [name.trim()]
        : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={`Add levels to ${building.name}`}>
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await run(() => api(`/sites/buildings/${building.id}/levels`, { body: { names, position: mode === "standard" ? "above" : position } }));
            if (ok) {
              onOpenChange(false);
              setName("");
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
                <Field label="Basements" inputMode="numeric" value={basements} onChange={(event) => setBasements(event.target.value)} />
              </div>
              <label className="flex min-h-touch items-center gap-3">
                <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={roof} onChange={(event) => setRoof(event.target.checked)} />
                Include a roof level
              </label>
              <p className="text-sm text-muted-foreground">Adds: {names.join(", ")}</p>
            </>
          ) : (
            <>
              <Field label="Level name" placeholder="e.g. Mezzanine" value={name} onChange={(event) => setName(event.target.value)} required />
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
          <FormActions>
            <Button type="submit" size="lg" disabled={names.length === 0}>
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

