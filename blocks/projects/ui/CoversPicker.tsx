"use client";

// Which buildings and levels a job works on (docs/stage-2-projects.md §1b).
// Single-level buildings are a tick. Multi-level buildings are "Whole
// building" (includes levels added later) or individual levels, with a
// quick From–To range.

import { useState } from "react";
import { Button, Icon, NativeSelect, cn } from "@grid/ui";

export interface Cover {
  buildingId: string;
  levelId: string | null;
}

interface Building {
  id: string;
  name: string;
  kind: "MULTI" | "SINGLE";
  levels: { id: string; name: string; shortName: string }[];
}

export function CoversPicker({ buildings, value, onChange }: { buildings: Building[]; value: Cover[]; onChange: (covers: Cover[]) => void }) {
  const has = (buildingId: string, levelId: string | null) => value.some((cover) => cover.buildingId === buildingId && cover.levelId === levelId);
  const without = (buildingId: string) => value.filter((cover) => cover.buildingId !== buildingId);

  return (
    <div className="flex flex-col gap-3">
      {buildings.map((building) => {
        if (building.kind === "SINGLE" || building.levels.length === 0) {
          const on = has(building.id, null);
          return (
            <Toggle key={building.id} on={on} onClick={() => onChange(on ? without(building.id) : [...without(building.id), { buildingId: building.id, levelId: null }])}>
              <span className="font-semibold">{building.name}</span>
              <span className="text-sm text-muted-foreground">{building.kind === "SINGLE" ? "Single-level" : "No levels yet"}</span>
            </Toggle>
          );
        }
        const whole = has(building.id, null);
        const picked = value.filter((cover) => cover.buildingId === building.id && cover.levelId).map((cover) => cover.levelId!);
        return (
          <fieldset key={building.id} className="rounded-xl bg-muted/40 p-3">
            <legend className="sr-only">{building.name}</legend>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold">{building.name}</span>
              <span className="text-sm text-muted-foreground">
                {whole ? "Whole building" : picked.length ? `${picked.length} of ${building.levels.length} levels` : "Not on this job"}
              </span>
            </div>
            <Toggle
              on={whole}
              onClick={() => onChange(whole ? without(building.id) : [...without(building.id), { buildingId: building.id, levelId: null }])}
            >
              <span className="font-semibold">Whole building</span>
              <span className="text-sm text-muted-foreground">Includes levels added later</span>
            </Toggle>
            {!whole && (
              <>
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Levels of ${building.name}`}>
                  {building.levels.map((level) => {
                    const on = picked.includes(level.id);
                    return (
                      <button
                        key={level.id}
                        type="button"
                        aria-pressed={on}
                        title={level.name}
                        onClick={() =>
                          onChange(on ? value.filter((cover) => cover.levelId !== level.id) : [...value, { buildingId: building.id, levelId: level.id }])
                        }
                        className={cn(
                          "h-10 min-w-12 rounded-md border-2 px-3 text-sm font-bold",
                          on ? "border-primary bg-accent text-accent-foreground" : "border-transparent bg-muted hover:bg-muted/70",
                        )}
                      >
                        {level.shortName}
                      </button>
                    );
                  })}
                </div>
                <RangePicker
                  building={building}
                  onPick={(ids) => onChange([...without(building.id), ...ids.map((id) => ({ buildingId: building.id, levelId: id }))])}
                />
              </>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "flex min-h-touch w-full items-center gap-3 rounded-lg border-2 px-3 py-2 text-left",
        on ? "border-primary bg-accent text-accent-foreground" : "border-transparent bg-muted hover:bg-muted/70",
      )}
    >
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded border-2", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
        {on && <Icon name="check" className="size-4" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">{children}</span>
    </button>
  );
}

/** "L3 to L5" in two taps. Levels are listed highest first. */
function RangePicker({ building, onPick }: { building: Building; onPick: (levelIds: string[]) => void }) {
  const levels = building.levels;
  const [from, setFrom] = useState(levels.at(-1)!.id);
  const [to, setTo] = useState(levels[0]!.id);
  const options = levels.map((level) => ({ value: level.id, label: level.name }));
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        From
        <NativeSelect aria-label={`From level, ${building.name}`} value={from} onChange={(event) => setFrom(event.target.value)} options={options} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        To
        <NativeSelect aria-label={`To level, ${building.name}`} value={to} onChange={(event) => setTo(event.target.value)} options={options} />
      </label>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          const fromIndex = levels.findIndex((level) => level.id === from);
          const z = levels.findIndex((level) => level.id === to);
          const [start, end] = fromIndex < z ? [fromIndex, z] : [z, fromIndex];
          onPick(levels.slice(start, end + 1).map((level) => level.id));
        }}
      >
        Pick range
      </Button>
    </div>
  );
}
