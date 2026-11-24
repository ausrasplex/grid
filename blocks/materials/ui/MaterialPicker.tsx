"use client";

// Pick a material from the list (the price book's material items, later the
// job's handover list). "Add a new material…" opens the material form with
// what was typed.
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button, EmptyState, List, SearchInput, Sheet, SheetContent, api } from "@grid/ui";
import { materialMeta } from "../words";
import { MaterialSheet } from "./MaterialSheet";
import { MaterialPicture, type MaterialJson } from "./shared";

export function MaterialPicker({
  title = "Pick a material",
  canAdd,
  onPick,
  onClose,
}: {
  title?: string;
  /** Can make new materials (materials.manage). */
  canAdd: boolean;
  onPick: (material: MaterialJson) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<MaterialJson[] | null>(null);
  const [adding, setAdding] = useState<Partial<MaterialJson> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      void api<MaterialJson[]>(`/materials?${params}`)
        .then(setRows)
        .catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  if (adding) {
    return (
      <MaterialSheet
        material={adding}
        onClose={() => setAdding(null)}
        onSaved={(saved) => (saved.removed ? setAdding(null) : onPick(saved))}
        onOpen={(existing) => onPick(existing)}
      />
    );
  }
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title={title}>
        <div className="flex flex-col gap-3 px-2">
          <SearchInput label="Search materials" placeholder="Name, type, brand, model or finish" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
          {canAdd && (
            <Button variant="outline" onClick={() => setAdding({ name: query.trim() })}>
              <Plus aria-hidden /> Add a new material…
            </Button>
          )}
          {rows && rows.length === 0 ? (
            <EmptyState title={query ? "Nothing matches" : "No materials yet"}>{canAdd ? "Add it as a new material." : "Ask an Owner or Foreman to add it."}</EmptyState>
          ) : (
            <List>
              {(rows ?? []).map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => onPick(row)} className="flex min-h-touch-lg w-full items-center gap-3 px-2 py-2 text-left hover:bg-muted active:bg-muted">
                    <MaterialPicture material={row} className="size-10" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{row.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">{[row.itemType, materialMeta(row)].filter(Boolean).join(" · ") || "No details yet"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </List>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
