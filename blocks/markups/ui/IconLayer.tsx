"use client";

// Trade icons on a plan sheet (phase 4c part 1, docs/roadmap.md "Phase 4c"):
//   - Icons (tool bar): the library, grouped by trade in accordions that
//     stay closed once closed (this device), with a search across them all
//   - pick one, then tap the plan to place it; it stays picked for the next
//   - number chips (1 · 2 · +) when the icon has numbered versions on this
//     job (DGPO 1 standard, DGPO 2 expensive), set per job only
//   - tap a placed icon to switch its number (or all like it on the sheet), or delete it
//   - Counts (tool bar): this sheet, this level or the whole job, split by
//     number, and each trade's layer shown or hidden
// Placed icons are markups (kind ICON), saved as soon as they're tapped.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronDown, ListOrdered, Plus, Settings2, Shapes, Trash2, Undo2, X } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  FormActions,
  PlanLayer,
  PlanToolButton,
  Scroller,
  SearchInput,
  Segmented,
  Sheet,
  SheetContent,
  Switch,
  api,
  cn,
  newId,
  usePlanOverlay,
  usePlanPointer,
  type PlanPointer,
} from "@grid/ui";
import { CUSTOM_TRADE, TRADES, iconLookup, type CustomIconRow, type IconLookup, type Trade, type TradeIcon } from "../icons";
import { distance, showsOn, type Point } from "../geometry";
import { IconGlyph, IconShape } from "./IconGlyph";
import { LayerPick } from "./MarkupLayer";

export interface PlacedIconJson {
  id: string;
  versionId: string;
  points: Point[];
  size: number;
  iconKey: string;
  iconNumber: number | null;
  /** The sheet layer it's on (null = Default). */
  layerId: string | null;
  canChange: boolean;
}

export interface IconVersionJson {
  id: string;
  iconKey: string;
  number: number;
  name: string | null;
  priceItemId: string | null;
}

export interface IconCountJson {
  sheetId: string;
  sheetNumber: string;
  sheetTitle: string;
  buildingId: string | null;
  levelId: string | null;
  iconKey: string;
  number: number;
  count: number;
}

export interface JobIconsJson {
  versions: IconVersionJson[];
  counts: IconCountJson[];
}

/** An icon's size on the sheet (a fraction of the sheet's width): about 10 mm on an A1. */
const ICON_SIZE = 0.012;
const CLOSED_KEY = "grid-icon-groups-closed";
const HIDDEN_KEY = "grid-icon-trades-hidden";

function readSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function writeSet(key: string, value: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...value]));
  } catch {
    // Private window: remembered for this visit only.
  }
}

/**
 * The ring around an icon with a checklist: grey before anything is ticked,
 * amber part way, green when it's all done. Drawing colours, like the inks
 * and trade colours (they print and read the same on any theme).
 */
function progressColour(progress: { done: number; total: number }): string {
  if (progress.done >= progress.total) return "#16a34a";
  if (progress.done > 0) return "#f59e0b";
  return "#9ca3af";
}

export function IconLayer({
  sheetId,
  projectId,
  levelId,
  initialIcons,
  initialJob,
  canAdd,
  customIcons,
  canManageIcons,
  documentsOn,
}: {
  sheetId: string;
  projectId: string;
  levelId: string | null;
  initialIcons: PlacedIconJson[];
  initialJob: JobIconsJson;
  canAdd: boolean;
  /** The business's own icons (phase 4c part 3), deleted ones too so placed ones still draw. */
  customIcons: CustomIconRow[];
  /** May add custom icons (Settings › Custom icons). */
  canManageIcons: boolean;
  /** Documents is on: a placed icon offers the manuals linked to its type. */
  documentsOn: boolean;
}) {
  const lookup = useMemo(() => iconLookup(customIcons), [customIcons]);
  const overlay = usePlanOverlay();
  const { view, version, versions, isCurrent, hidden, setTool, selectMarkup, setMarkupPanel, markupProgress, setPlacedMarkups } = overlay;
  const placing = overlay.tool === "markups.icon";
  const canPlace = canAdd && isCurrent;

  const [icons, setIcons] = useState(initialIcons);
  const [job, setJob] = useState(initialJob);
  const [picked, setPicked] = useState<{ iconKey: string; number: number | null } | null>(null);
  const [library, setLibrary] = useState(false);
  const [counts, setCounts] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placedNow, setPlacedNow] = useState<string[]>([]);
  const [hiddenTrades, setHiddenTrades] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState<{ iconKey: string; version?: IconVersionJson } | null>(null);

  useEffect(() => setHiddenTrades(readSet(HIDDEN_KEY)), []);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);
  useEffect(() => {
    if (placing) setSelectedId(null);
  }, [placing]);

  const failed = (failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure));
  const numbersOf = useCallback((iconKey: string) => job.versions.filter((entry) => entry.iconKey === iconKey).sort((first, second) => first.number - second.number), [job.versions]);

  // Counts follow placing and deleting, a moment after the last tap.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      void api<JobIconsJson>(`/markups/job/${projectId}/icons`)
        .then(setJob)
        .catch(() => {});
    }, 800);
  }, [projectId]);

  const visible = useMemo(
    () => showsOn(icons, version.id, versions).filter((entry) => !hiddenTrades.has(lookup.trade(entry.iconKey)?.id ?? "") && overlay.layerShown(entry.layerId)),
    [icons, version.id, versions, hiddenTrades, lookup, overlay.layerShown],
  );
  const selected = visible.find((entry) => entry.id === selectedId) ?? null;

  // --- placing ---------------------------------------------------------------
  const place = useCallback(
    async (point: Point) => {
      if (!picked) return;
      const id = newId();
      const numbered = numbersOf(picked.iconKey).length >= 2;
      const placed: PlacedIconJson = { id, versionId: version.id, points: [point], size: ICON_SIZE, iconKey: picked.iconKey, iconNumber: numbered ? (picked.number ?? 1) : null, layerId: overlay.activeLayerId, canChange: true };
      setIcons((current) => [...current, placed]);
      setPlacedNow((current) => [...current, id]);
      try {
        await api("/markups", {
          body: { id, sheetId, versionId: version.id, kind: "ICON", points: [point], color: "black", size: ICON_SIZE, iconKey: placed.iconKey, iconNumber: placed.iconNumber, layerId: placed.layerId },
        });
        refresh();
      } catch (failure) {
        setIcons((current) => current.filter((entry) => entry.id !== id));
        setPlacedNow((current) => current.filter((entry) => entry !== id));
        failed(failure);
      }
    },
    [picked, numbersOf, version.id, sheetId, refresh, overlay.activeLayerId],
  );

  const remove = async (ids: string[]) => {
    const gone = icons.filter((entry) => ids.includes(entry.id));
    setIcons((current) => current.filter((entry) => !ids.includes(entry.id)));
    setSelectedId(null);
    try {
      for (const id of ids) await api(`/markups/${id}`, { method: "DELETE" });
      refresh();
    } catch (failure) {
      setIcons((current) => [...current, ...gone.filter((entry) => !current.some((other) => other.id === entry.id))]);
      failed(failure);
    }
  };

  const moveToLayer = async (id: string, layerId: string | null) => {
    const before = icons;
    setIcons((current) => current.map((entry) => (entry.id === id ? { ...entry, layerId } : entry)));
    try {
      await api(`/markups/${id}`, { method: "PATCH", body: { layerId } });
    } catch (failure) {
      setIcons(before);
      failed(failure);
    }
  };

  const renumber = async (ids: string[], iconNumber: number) => {
    const before = icons;
    setIcons((current) => current.map((entry) => (ids.includes(entry.id) ? { ...entry, iconNumber } : entry)));
    try {
      await api("/markups/icons/renumber", { body: { ids, iconNumber } });
      refresh();
    } catch (failure) {
      setIcons(before);
      failed(failure);
    }
  };

  const latest = useRef({ placing, canPlace, visible, view, hidden, otherTool: false, place });
  latest.current = { placing, canPlace, visible, view, hidden, otherTool: !!overlay.tool && !placing, place };
  const onPointer = useCallback((pointer: PlanPointer) => {
    const { placing, canPlace, visible, view, hidden, otherTool, place } = latest.current;
    if (otherTool || hidden || pointer.kind !== "click") return;
    if (placing) {
      if (canPlace) void place(pointer.point);
      return;
    }
    // No tool: a tap near an icon selects it.
    let nearest: PlacedIconJson | null = null;
    let gap = Infinity;
    for (const entry of visible) {
      const reach = entry.size * 0.6 + 10 / view.scale;
      const away = distance(entry.points[0]!, pointer.point);
      if (away <= reach && away < gap) {
        nearest = entry;
        gap = away;
      }
    }
    setSelectedId(nearest?.id ?? null);
  }, []);
  usePlanPointer(onPointer);

  const pick = (iconKey: string) => {
    const numbers = numbersOf(iconKey);
    setPicked({ iconKey, number: numbers.length >= 2 ? 1 : null });
    setLibrary(false);
    setPlacedNow([]);
    // Taps place; dragging still moves the plan to the next spot.
    if (canPlace) setTool("markups.icon", { tapsOnly: true });
  };

  const addNumber = async (iconKey: string, name: string | null) => {
    const fresh = await api<JobIconsJson>(`/markups/job/${projectId}/icon-versions`, { body: { iconKey, name } });
    setJob(fresh);
    const highest = Math.max(...fresh.versions.filter((entry) => entry.iconKey === iconKey).map((entry) => entry.number));
    if (picked?.iconKey === iconKey) setPicked({ iconKey, number: highest });
  };

  // --- drawing -----------------------------------------------------------------
  const drawn = useMemo(
    () =>
      visible.map((entry) => {
        const icon = lookup.icon(entry.iconKey);
        const trade = lookup.trade(entry.iconKey);
        if (!icon || !trade) return null;
        const [x, y] = entry.points[0]!;
        const numbered = numbersOf(entry.iconKey).length >= 2;
        const progress = markupProgress[entry.id];
        return (
          <g key={entry.id} transform={`translate(${x - entry.size / 2} ${y - entry.size / 2}) scale(${entry.size / 24})`}>
            {progress && progress.total > 0 && <circle cx={12} cy={12} r={15} fill="none" stroke={progressColour(progress)} strokeWidth={3} />}
            <IconShape icon={icon} colour={trade.colour} />
            {numbered && (
              <text x={23} y={2} fontSize={9} fontWeight={800} fontFamily="system-ui, sans-serif" fill={trade.colour} stroke="white" strokeWidth={2.5} paintOrder="stroke">
                {entry.iconNumber ?? 1}
              </text>
            )}
          </g>
        );
      }),
    [visible, numbersOf, lookup, markupProgress],
  );

  const pickedIcon = picked ? lookup.icon(picked.iconKey) : null;
  const pickedTrade = picked ? lookup.trade(picked.iconKey) : null;
  const pickedNumbers = picked ? numbersOf(picked.iconKey) : [];
  const selectedIcon = selected ? lookup.icon(selected.iconKey) : null;
  const selectedNumbers = selected ? numbersOf(selected.iconKey) : [];
  const selectedName = selectedIcon ? `${selectedIcon.name}${selectedNumbers.length >= 2 ? ` ${selected!.iconNumber ?? 1}` : ""}` : null;

  // Tell the other Blocks which icon is open, so its checklist and photos join the panel.
  useEffect(() => {
    selectMarkup(selected && selectedName && !placing ? { id: selected.id, name: selectedName } : null);
  }, [selected?.id, selectedName, placing, selectMarkup]);
  useEffect(() => () => selectMarkup(null), [selectMarkup]);

  // Another Block picked an icon (What's left): open its panel.
  const requestedId = overlay.selectedMarkup?.id ?? null;
  useEffect(() => {
    if (requestedId && requestedId !== selectedId && visible.some((entry) => entry.id === requestedId)) setSelectedId(requestedId);
    // Only when the request changes; our own selection is pushed out above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedId]);

  // Tell the other Blocks which icons are showing, what they're called and where (What's left lists them).
  useEffect(() => {
    setPlacedMarkups(
      visible.flatMap((entry) => {
        const icon = lookup.icon(entry.iconKey);
        if (!icon) return [];
        const numbered = numbersOf(entry.iconKey).length >= 2;
        return [{ id: entry.id, name: `${icon.name}${numbered ? ` ${entry.iconNumber ?? 1}` : ""}`, point: entry.points[0]! as [number, number] }];
      }),
    );
  }, [visible, lookup, numbersOf, setPlacedMarkups]);
  useEffect(() => () => setPlacedMarkups([]), [setPlacedMarkups]);

  const likeSelected = selected ? visible.filter((entry) => entry.iconKey === selected.iconKey && (entry.iconNumber ?? 1) === (selected.iconNumber ?? 1) && entry.canChange) : [];

  return (
    <>
      {!hidden && drawn.length > 0 && <PlanLayer>{drawn}</PlanLayer>}
      {!hidden && selected && (
        <PlanLayer>
          <circle cx={selected.points[0]![0]} cy={selected.points[0]![1]} r={selected.size * 0.75} fill="none" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        </PlanLayer>
      )}

      {/* Placing: what's picked, its numbers, Undo and put it down. */}
      {placing && pickedIcon && pickedTrade && (
        <div className="pointer-events-auto absolute inset-x-2 top-2 mx-auto flex max-w-md flex-col gap-2 rounded-xl bg-neutral-900/95 px-3 py-2 text-sm text-white shadow-lg">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setLibrary(true)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md text-left hover:bg-white/10" aria-label="Pick another icon">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white">
                <IconGlyph icon={pickedIcon} colour={pickedTrade.colour} className="size-7" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{pickedIcon.name}</span>
                <span className="block text-xs text-white/70">{canPlace ? `Tap the plan to place. ${placedNow.length ? `${placedNow.length} placed.` : ""}` : "Open the current revision to place icons."}</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-white/60" />
            </button>
            <button
              type="button"
              className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-30"
              disabled={!placedNow.length}
              onClick={() => {
                const last = placedNow[placedNow.length - 1];
                if (!last) return;
                setPlacedNow((current) => current.slice(0, -1));
                void remove([last]);
              }}
              aria-label="Take back the last icon"
            >
              <Undo2 className="size-5" />
            </button>
            <button type="button" className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10" onClick={() => setTool(null)} aria-label="Put the icon down">
              <X className="size-5" />
            </button>
          </div>
          {canPlace && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Number">
              {pickedNumbers.length >= 2 &&
                pickedNumbers.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setPicked({ iconKey: entry.iconKey, number: entry.number })}
                    aria-pressed={(picked?.number ?? 1) === entry.number}
                    className={cn("min-h-10 rounded-full px-3 font-semibold", (picked?.number ?? 1) === entry.number ? "bg-primary text-primary-foreground" : "bg-white/10 hover:bg-white/20")}
                  >
                    {entry.number}
                    {entry.name ? ` · ${entry.name}` : ""}
                  </button>
                ))}
              <button type="button" onClick={() => setNaming({ iconKey: pickedIcon.key })} className="flex min-h-10 items-center gap-1 rounded-full bg-white/10 px-3 hover:bg-white/20" aria-label="Add a numbered version of this icon">
                <Plus className="size-4" /> {pickedNumbers.length >= 2 ? "" : "Number it"}
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="pointer-events-auto absolute inset-x-2 top-28 mx-auto max-w-md rounded-xl bg-destructive px-3 py-2 text-sm text-white shadow-lg">
          {error}
        </div>
      )}

      {/* A placed icon, tapped. */}
      {selected && selectedIcon && !placing && (
        <div className="pointer-events-auto absolute right-[4.5rem] bottom-2 left-2 mx-auto flex max-w-md flex-col gap-2 rounded-xl bg-card p-3 text-card-foreground shadow-lg sm:inset-x-2">
          <div className="flex items-center gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white">
              <IconGlyph icon={selectedIcon} colour={lookup.trade(selected.iconKey)!.colour} className="size-7" />
            </span>
            <p className="min-w-0 flex-1 font-semibold">{selectedName}</p>
            {documentsOn && (
              <Button variant="outline" size="sm" asChild>
                <a href={`/documents/icon/${encodeURIComponent(selected.iconKey)}?name=${encodeURIComponent(selectedIcon.name)}&back=${encodeURIComponent(`/plans/sheet/${sheetId}`)}`} aria-label="Manuals">
                  {/* Just the book on phones, so the icon's name has room. */}
                  <BookOpen /> <span className="hidden sm:inline">Manuals</span>
                </a>
              </Button>
            )}
            {selected.canChange && canPlace && (
              <Button variant="ghost" size="icon" aria-label="Delete this icon" onClick={() => void remove([selected.id])}>
                <Trash2 />
              </Button>
            )}
            <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setSelectedId(null)}>
              <X />
            </Button>
          </div>
          {selected.canChange && canPlace && selectedNumbers.length >= 2 && (
            <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Switch to number">
                {selectedNumbers.map((entry) => (
                  <Button key={entry.id} size="sm" variant={(selected.iconNumber ?? 1) === entry.number ? "default" : "outline"} onClick={() => void renumber([selected.id], entry.number)}>
                    {entry.number}
                    {entry.name ? ` · ${entry.name}` : ""}
                  </Button>
                ))}
              </div>
              {likeSelected.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">
                    All {likeSelected.length} like it on this sheet to:
                  </span>
                  {selectedNumbers
                    .filter((entry) => entry.number !== (selected.iconNumber ?? 1))
                    .map((entry) => (
                      <Button key={entry.id} size="sm" variant="outline" onClick={() => void renumber(likeSelected.map((like) => like.id), entry.number)}>
                        {entry.number}
                      </Button>
                    ))}
                </div>
              )}
            </>
          )}
          {selected.canChange && canPlace && <LayerPick layerId={selected.layerId} onChange={(layerId) => void moveToLayer(selected.id, layerId)} />}
          {/* Other Blocks' parts of the panel: the icon's checklist and photos (PlanMarkupSection). */}
          <Scroller className="-mx-3 max-h-[50vh] px-3">
            <div ref={setMarkupPanel} className="flex flex-col gap-3 empty:hidden" />
          </Scroller>
        </div>
      )}

      {/* The tool bar under the plan. */}
      {canPlace && <PlanToolButton label="Icons" icon={<Shapes />} order={20} active={placing || library} onClick={() => (placing ? setTool(null) : setLibrary(true))} />}
      <PlanToolButton label="Counts" icon={<ListOrdered />} order={40} active={counts} onClick={() => setCounts(true)} />

      <Sheet open={library} onOpenChange={setLibrary}>
        <SheetContent title="Icons" description="Pick one, then tap the plan to place it. It stays picked for the next one.">
          <IconLibrary lookup={lookup} onPick={pick} canManage={canManageIcons} />
        </SheetContent>
      </Sheet>

      <Sheet open={counts} onOpenChange={setCounts}>
        <SheetContent title="Icon counts" description="Placed icons, split by number. These become the quote's take-off.">
          <CountsPanel
            lookup={lookup}
            job={job}
            sheetId={sheetId}
            levelId={levelId}
            hiddenTrades={hiddenTrades}
            canEdit={canAdd}
            onHiddenTrades={(next) => {
              setHiddenTrades(next);
              writeSet(HIDDEN_KEY, next);
            }}
            onRename={(entry) => setNaming({ iconKey: entry.iconKey, version: entry })}
            onAddNumber={(iconKey) => setNaming({ iconKey })}
            onRemove={async (entry) => {
              try {
                setJob(await api<JobIconsJson>(`/markups/icon-versions/${entry.id}`, { method: "DELETE" }));
              } catch (failure) {
                failed(failure);
              }
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={!!naming} onOpenChange={(open) => !open && setNaming(null)}>
        <SheetContent
          desktop="dialog"
          title={naming?.version ? `${lookup.icon(naming.iconKey)?.name} ${naming.version.number}` : `Add a number to ${lookup.icon(naming?.iconKey ?? "")?.name ?? "this icon"}`}
          description={
            naming?.version
              ? "A short name, shown on the chips and in the counts."
              : numbersOf(naming?.iconKey ?? "").length >= 2
                ? "The next number, for a different kind of this item on this job (its own price on the quote)."
                : "Icons already placed become number 1; this makes number 2, for a different kind on this job (e.g. a dearer fitting). Numbers belong to this job only."
          }
        >
          {naming && (
            <NameForm
              initial={naming.version?.name ?? ""}
              onSave={async (name) => {
                if (naming.version) setJob(await api<JobIconsJson>(`/markups/icon-versions/${naming.version.id}`, { method: "PATCH", body: { name: name || null } }));
                else await addNumber(naming.iconKey, name || null);
                setNaming(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** The icon library: a search across every trade, then each trade as an accordion (closed ones stay closed on this device). */
function IconLibrary({ lookup, onPick, canManage }: { lookup: IconLookup; onPick: (iconKey: string) => void; canManage: boolean }) {
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  useEffect(() => setClosed(readSet(CLOSED_KEY)), []);
  const searching = query.trim().length > 0;
  const groups = lookup.search(query);
  const toggle = (tradeId: string) => {
    const next = new Set(closed);
    if (next.has(tradeId)) next.delete(tradeId);
    else next.add(tradeId);
    setClosed(next);
    writeSet(CLOSED_KEY, next);
  };
  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <SearchInput label="Search icons" placeholder="Search icons, e.g. power point" value={query} onChange={(event) => setQuery(event.target.value)} />
      {searching && !groups.length && <p className="text-sm text-muted-foreground">No icons match.{canManage ? " You can make your own in Custom icons." : ""}</p>}
      {canManage && (
        <a href="/markups/icons" className="flex min-h-touch items-center gap-2 self-start rounded-md px-2 text-sm font-semibold text-primary hover:underline">
          <Settings2 className="size-4" /> Custom icons: make your own
        </a>
      )}
      {groups.map(({ trade, icons }) => {
        const open = searching || !closed.has(trade.id);
        return (
          <section key={trade.id} className="rounded-lg border">
            <button type="button" onClick={() => !searching && toggle(trade.id)} aria-expanded={open} className="flex min-h-touch w-full items-center gap-2 px-3 text-left font-semibold">
              <span className="size-3 shrink-0 rounded-full" style={{ background: trade.colour }} aria-hidden />
              <span className="flex-1">{trade.name}</span>
              <span className="text-sm font-normal text-muted-foreground">{icons.length}</span>
              {!searching && <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} aria-hidden />}
            </button>
            {open && (
              <ul className="grid grid-cols-3 gap-1 px-2 pb-2 sm:grid-cols-4">
                {icons.map((entry) => (
                  <li key={entry.key}>
                    <button type="button" onClick={() => onPick(entry.key)} className="flex min-h-touch-lg w-full flex-col items-center gap-1 rounded-md p-2 text-center text-xs hover:bg-muted">
                      <span className="paper flex size-10 items-center justify-center rounded-md bg-white">
                        <IconGlyph icon={entry} colour={trade.colour} className="size-8" />
                      </span>
                      <span className="leading-tight">{entry.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

type Scope = "sheet" | "level" | "job";

/** Counts for this sheet, this level or the whole job, split by number; and each trade's layer. */
function CountsPanel({
  lookup,
  job,
  sheetId,
  levelId,
  hiddenTrades,
  canEdit,
  onHiddenTrades,
  onRename,
  onAddNumber,
  onRemove,
}: {
  lookup: IconLookup;
  job: JobIconsJson;
  sheetId: string;
  levelId: string | null;
  hiddenTrades: Set<string>;
  canEdit: boolean;
  onHiddenTrades: (next: Set<string>) => void;
  onRename: (version: IconVersionJson) => void;
  onAddNumber: (iconKey: string) => void;
  onRemove: (version: IconVersionJson) => Promise<void>;
}) {
  const [scope, setScope] = useState<Scope>("sheet");
  const rows = job.counts.filter((entry) => (scope === "sheet" ? entry.sheetId === sheetId : scope === "level" ? !!levelId && entry.levelId === levelId : true));
  const sheetsCounted = new Set(rows.map((entry) => entry.sheetId)).size;
  // Icon → number → count.
  const totals = new Map<string, Map<number, number>>();
  for (const entry of rows) {
    const numbers = totals.get(entry.iconKey) ?? new Map<number, number>();
    numbers.set(entry.number, (numbers.get(entry.number) ?? 0) + entry.count);
    totals.set(entry.iconKey, numbers);
  }
  // Group by trade (custom icons in theirs, or Custom), in the library's order.
  const tradeOrder: Trade[] = [CUSTOM_TRADE, ...TRADES];
  const groupsFor = (keys: string[]) =>
    tradeOrder
      .map((trade) => ({ trade, keys: keys.filter((key) => lookup.trade(key)?.id === trade.id).sort((first, second) => (lookup.icon(first)?.name ?? "").localeCompare(lookup.icon(second)?.name ?? "")) }))
      .filter((group) => group.keys.length > 0);
  const groups = groupsFor([...totals.keys()]);
  const tradesUsed = new Set(job.counts.map((entry) => lookup.trade(entry.iconKey)?.id).filter(Boolean) as string[]);

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <Segmented
        label="Count"
        value={scope}
        onChange={setScope}
        items={[
          { value: "sheet", label: "This sheet" },
          ...(levelId ? [{ value: "level" as const, label: "This level" }] : []),
          { value: "job", label: "Whole job" },
        ]}
      />
      {scope !== "sheet" && <p className="-mt-2 text-xs text-muted-foreground">From {sheetsCounted} sheet{sheetsCounted === 1 ? "" : "s"}{scope === "level" ? " filed to this level" : ""}.</p>}
      {!totals.size ? (
        <p className="text-sm text-muted-foreground">No icons placed {scope === "sheet" ? "on this sheet" : scope === "level" ? "on this level" : "on this job"} yet. Pick one with Icons in the tool bar.</p>
      ) : (
        groups.map(({ trade, keys }) => (
          <section key={trade.id} className="flex flex-col gap-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span className="size-3 rounded-full" style={{ background: trade.colour }} aria-hidden />
              {trade.name}
            </h3>
            <ul className="flex flex-col divide-y rounded-lg border">
              {keys.map((key) => {
                const icon = lookup.icon(key);
                return icon ? (
                  <CountRows key={key} icon={icon} colour={trade.colour} counts={totals.get(key)!} versions={job.versions.filter((version) => version.iconKey === key)} canEdit={canEdit} onRename={onRename} onAddNumber={onAddNumber} onRemove={onRemove} />
                ) : null;
              })}
            </ul>
          </section>
        ))
      )}
      {tradesUsed.size > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Show on the plan</h3>
          {tradeOrder.filter((trade) => tradesUsed.has(trade.id)).map((trade) => (
            <label key={trade.id} className="flex min-h-touch items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: trade.colour }} aria-hidden />
                {trade.name}
              </span>
              <Switch
                checked={!hiddenTrades.has(trade.id)}
                onCheckedChange={(on) => {
                  const next = new Set(hiddenTrades);
                  if (on) next.delete(trade.id);
                  else next.add(trade.id);
                  onHiddenTrades(next);
                }}
              />
            </label>
          ))}
        </section>
      )}
    </div>
  );
}

function CountRows({
  icon,
  colour,
  counts,
  versions,
  canEdit,
  onRename,
  onAddNumber,
  onRemove,
}: {
  icon: TradeIcon;
  colour: string;
  counts: Map<number, number>;
  versions: IconVersionJson[];
  canEdit: boolean;
  onRename: (version: IconVersionJson) => void;
  onAddNumber: (iconKey: string) => void;
  onRemove: (version: IconVersionJson) => Promise<void>;
}) {
  const numbered = versions.length >= 2;
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return (
    <li className="flex flex-col gap-1 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="paper flex size-8 shrink-0 items-center justify-center rounded bg-white">
          <IconGlyph icon={icon} colour={colour} className="size-6" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{icon.name}</span>
        <span className="font-semibold tabular-nums">× {total}</span>
        {canEdit && !numbered && (
          <Button variant="ghost" size="sm" onClick={() => onAddNumber(icon.key)} aria-label={`Number ${icon.name}`}>
            <Plus /> Number
          </Button>
        )}
      </div>
      {numbered && (
        <ul className="ml-10 flex flex-col">
          {versions.map((version) => (
            <li key={version.id} className="flex min-h-10 items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {icon.name} {version.number}
                {version.name ? ` · ${version.name}` : ""}
              </span>
              <span className="tabular-nums">× {counts.get(version.number) ?? 0}</span>
              {canEdit && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => onRename(version)}>
                    Name
                  </Button>
                  {!(counts.get(version.number) ?? 0) && (
                    <Button variant="ghost" size="icon" aria-label={`Remove number ${version.number}`} onClick={() => void onRemove(version)}>
                      <Trash2 />
                    </Button>
                  )}
                </>
              )}
            </li>
          ))}
          {canEdit && (
            <li>
              <Button variant="ghost" size="sm" onClick={() => onAddNumber(icon.key)}>
                <Plus /> Another number
              </Button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function NameForm({ initial, onSave }: { initial: string; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-3 px-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          await onSave(name.trim());
        } catch (failure) {
          setError((failure as Error).message);
          setBusy(false);
        }
      }}
    >
      <Field label="Short name (optional)" placeholder="e.g. Standard, Iconic, Weatherproof" maxLength={40} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      <Alert variant="error">{error}</Alert>
      <FormActions>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </FormActions>
    </form>
  );
}
