"use client";

// Pick an existing site, then (when it has them) a building and a floor.
// Used where something is set up before a job exists: New quote. The floor
// is optional ("Whole building"); a house site needs no more than the site.

import { useEffect, useState } from "react";
import { Building2, Home, X } from "lucide-react";
import { Button, Label, SearchInput, SelectField, Sheet, SheetContent, api } from "@grid/ui";

export interface PlaceSite {
  id: string;
  name: string;
  address: string;
  kind: "MANAGED" | "PRIVATE";
  buildings: { id: string; name: string; kind: "MULTI" | "SINGLE"; levels: { id: string; name: string; label?: string }[] }[];
}

export interface PlaceValue {
  site: PlaceSite;
  buildingId: string | null;
  levelId: string | null;
}

interface SiteRow {
  id: string;
  name: string;
  address: string;
  kind: "MANAGED" | "PRIVATE";
}

/** The building to start on: the only one, or none until picked. */
const firstBuilding = (site: PlaceSite) => (site.buildings.length === 1 ? site.buildings[0]!.id : null);

export function PlacePicker({ value, onChange, hint }: { value: PlaceValue | null; onChange: (value: PlaceValue | null) => void; hint?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [loadingSite, setLoadingSite] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      api<SiteRow[]>(`/sites?tab=active${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}`)
        .then(setRows)
        .catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [open, query]);

  const choose = async (row: SiteRow) => {
    setLoadingSite(true);
    try {
      const site = await api<PlaceSite>(`/sites/${row.id}`);
      onChange({ site, buildingId: firstBuilding(site), levelId: null });
      setOpen(false);
    } finally {
      setLoadingSite(false);
    }
  };

  const building = value?.site.buildings.find((candidate) => candidate.id === value.buildingId) ?? null;

  return (
    <div className="flex flex-col gap-3 lg:max-w-2xl">
      <div className="flex flex-col gap-2">
        <Label>Site</Label>
        {hint && <p className="-mt-1 text-sm text-muted-foreground">{hint}</p>}
        <Sheet open={open} onOpenChange={setOpen}>
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex min-h-touch min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-left"
            >
              {value ? (
                <span className="flex min-w-0 items-center gap-2">
                  {value.site.kind === "MANAGED" ? <Building2 className="size-5 shrink-0 text-muted-foreground" /> : <Home className="size-5 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{value.site.name}</span>
                    {value.site.address !== value.site.name && <span className="block truncate text-sm text-muted-foreground">{value.site.address}</span>}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">Choose an existing site (optional)</span>
              )}
              <span className="shrink-0 text-sm font-semibold text-primary">{value ? "Change" : "Choose"}</span>
            </button>
            {value && (
              <Button type="button" variant="ghost" size="icon" aria-label="No site" onClick={() => onChange(null)}>
                <X />
              </Button>
            )}
          </div>
          <SheetContent title="Choose a site">
            <div className="flex flex-col gap-3 px-2">
              <SearchInput label="Search sites" placeholder="Site name, address or client" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
              <ul className="divide-y rounded-lg border">
                {rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      disabled={loadingSite}
                      onClick={() => void choose(row)}
                      className="flex min-h-touch-lg w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted disabled:opacity-60"
                    >
                      {row.kind === "MANAGED" ? <Building2 className="size-5 shrink-0 text-muted-foreground" /> : <Home className="size-5 shrink-0 text-muted-foreground" />}
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{row.name}</span>
                        {row.address !== row.name && <span className="block truncate text-sm text-muted-foreground">{row.address}</span>}
                      </span>
                    </button>
                  </li>
                ))}
                {rows.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">{query ? "No sites match." : "No active sites yet."}</li>}
              </ul>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {value && value.site.buildings.length > 1 && (
        <SelectField
          label="Building"
          value={value.buildingId ?? ""}
          placeholder="Choose a building"
          onChange={(event) => onChange({ ...value, buildingId: event.target.value || null, levelId: null })}
          options={value.site.buildings.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
        />
      )}
      {value && building?.kind === "MULTI" && building.levels.length > 0 && (
        <SelectField
          label="Floor"
          value={value.levelId ?? ""}
          onChange={(event) => onChange({ ...value, levelId: event.target.value || null })}
          options={[{ value: "", label: "Whole building" }, ...building.levels.map((level) => ({ value: level.id, label: level.label ?? level.name }))]}
        />
      )}
    </div>
  );
}
