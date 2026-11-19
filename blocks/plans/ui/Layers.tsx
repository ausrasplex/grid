"use client";

// Layers on a plan sheet (docs/plans-block.md "Layers"). Every sheet has
// Default; people add more (Power, Data, Lighting; Water, Drainage). Markups,
// icons and photo pins go on the layer you're drawing on. Turning a layer
// off hides it just for you, remembered on this device.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Alert, Button, Field, api, cn, useAction } from "@grid/ui";

export interface LayerJson {
  id: string;
  name: string;
  canChange: boolean;
}

/** Default (no row) is stored as this in the hidden list. */
const DEFAULT = "default";

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private window: it just isn't remembered */
  }
};

/** The sheet's layers, the one being drawn on, and which are off for this person. */
export function useSheetLayers(sheetId: string, initial: LayerJson[]) {
  const [layers, setLayers] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const activeKey = `grid.plan-layer.${sheetId}`;
  const hiddenKey = `grid.plan-layers-off.${sheetId}`;

  // What this person had last time on this device.
  useEffect(() => {
    setActiveId(read(activeKey));
    try {
      setHiddenIds(new Set(JSON.parse(read(hiddenKey) ?? "[]") as string[]));
    } catch {
      setHiddenIds(new Set());
    }
  }, [activeKey, hiddenKey]);

  const live = useMemo(() => new Set(layers.map((layer) => layer.id)), [layers]);
  // A layer that's gone: back on Default.
  const active = activeId && live.has(activeId) ? activeId : null;
  const keyOf = useCallback((layerId: string | null | undefined) => (layerId && live.has(layerId) ? layerId : DEFAULT), [live]);
  const layerShown = useCallback((layerId: string | null | undefined) => !hiddenIds.has(keyOf(layerId)), [hiddenIds, keyOf]);

  const setActive = (layerId: string | null) => {
    setActiveId(layerId);
    write(activeKey, layerId);
    // Drawing on a layer you've hidden would look like nothing happened.
    if (hiddenIds.has(keyOf(layerId))) toggle(layerId);
  };
  const toggle = (layerId: string | null) => {
    const key = keyOf(layerId);
    setHiddenIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      write(hiddenKey, JSON.stringify([...next]));
      return next;
    });
  };
  const hiddenCount = [DEFAULT, ...layers.map((layer) => layer.id)].filter((key) => hiddenIds.has(key)).length;

  return { layers, setLayers, active, setActive, toggle, layerShown, hiddenCount };
}

export type SheetLayers = ReturnType<typeof useSheetLayers>;

/** The Layers panel: pick the layer to draw on, turn layers on and off, add, rename, delete. */
export function LayersPanel({ sheetId, state, canAdd }: { sheetId: string; state: SheetLayers; canAdd: boolean }) {
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const action = useAction();
  const rows: { id: string | null; name: string; canChange: boolean }[] = [{ id: null, name: "Default", canChange: false }, ...state.layers];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Tap a layer to draw on it: new markups, icons and photo pins go there. The eye turns it off for you only.</p>
      <ul className="divide-y rounded-lg border">
        {rows.map((row) => {
          const drawing = state.active === row.id;
          const shown = state.layerShown(row.id);
          return (
            <li key={row.id ?? "default"} className={cn("flex items-center gap-1 pr-1", drawing && "bg-primary/10")}>
              {renaming && renaming.id === row.id ? (
                <form
                  className="flex flex-1 items-center gap-2 p-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void action.run(async () => {
                      const saved = await api<LayerJson>(`/plans/layers/${renaming.id}`, { method: "PATCH", body: { name: renaming.name } });
                      state.setLayers((current) => current.map((layer) => (layer.id === saved.id ? saved : layer)));
                      setRenaming(null);
                    });
                  }}
                >
                  <Field label="Layer name" className="flex-1" value={renaming.name} maxLength={60} onChange={(event) => setRenaming({ ...renaming, name: event.target.value })} autoFocus />
                  <Button type="submit" size="icon" aria-label="Save the name" disabled={action.busy}>
                    <Check />
                  </Button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    aria-pressed={drawing}
                    onClick={() => state.setActive(row.id)}
                    className={cn("flex min-h-touch-lg min-w-0 flex-1 flex-col justify-center px-3 py-2 text-left", !shown && "opacity-50")}
                  >
                    <span className="truncate font-semibold">{row.name}</span>
                    <span className="text-xs text-muted-foreground">{drawing ? "Drawing on this layer" : shown ? "On" : "Off for you"}</span>
                  </button>
                  <Button variant="ghost" size="icon" aria-label={shown ? `Turn ${row.name} off` : `Turn ${row.name} on`} aria-pressed={shown} onClick={() => state.toggle(row.id)}>
                    {shown ? <Eye /> : <EyeOff />}
                  </Button>
                  {row.id && row.canChange && (
                    <>
                      <Button variant="ghost" size="icon" aria-label={`Rename ${row.name}`} onClick={() => setRenaming({ id: row.id!, name: row.name })}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        aria-label={`Delete ${row.name}`}
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(async () => {
                            if (!window.confirm(`Delete the ${row.name} layer? Everything on it moves to Default; nothing is deleted.`)) return;
                            await api(`/plans/layers/${row.id}`, { method: "DELETE" });
                            state.setLayers((current) => current.filter((layer) => layer.id !== row.id));
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {canAdd && (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              const layer = await api<LayerJson>(`/plans/sheet/${sheetId}/layers`, { body: { name } });
              state.setLayers((current) => [...current, layer]);
              state.setActive(layer.id);
              setName("");
            });
          }}
        >
          <Field label="New layer" placeholder="e.g. Power, Data, Drainage" className="flex-1" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
          <Button type="submit" disabled={action.busy || !name.trim()}>
            <Plus /> Add
          </Button>
        </form>
      )}
      <Alert variant="error">{action.error}</Alert>
    </div>
  );
}
