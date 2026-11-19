"use client";

// The spreadsheet viewer (docs/documents-block.md, "Spreadsheet viewer").
// View only: sheet tabs along the bottom, the header row and first column
// stay put while scrolling, search the whole file, filter and sort a
// column (the view only, never the file), tap a row number for the row as
// a card. Only the rows on screen are drawn, so thousands of rows scroll
// smoothly on a phone. Each sheet's JSON is made once on the server.
// Other Blocks add to it through the "documents.sheet" slot (@grid/ui
// sheet-slot: a column per row, a row filter, the bar, the row card).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Minus, Plus, X } from "lucide-react";
import {
  Button,
  Checkbox,
  Field,
  FormActions,
  Scroller,
  SearchInput,
  Sheet,
  SheetContent,
  SheetSlotProvider,
  api,
  cn,
  type SheetColumn,
  type SheetInfo,
  type SheetSlotValue,
  type SheetViewerPanelProps,
} from "@grid/ui";
import type { SheetData, SheetSummary } from "../sheets";

const ROW_HEIGHT = 30;
const FONT_SIZE = 13;
const ROW_NUMBER_WIDTH = 48;
const OVERSCAN = 12;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));

type SortOrder = { column: number; direction: "up" | "down" } | null;
/** Per sheet: the values shown for each filtered column, and the sort. */
interface SheetView {
  filters: Record<number, string[]>;
  sort: SortOrder;
}
const EMPTY_VIEW: SheetView = { filters: {}, sort: null };

interface Match {
  sheet: number;
  row: number;
  column: number;
}

const compareText = (first: string, second: string) => {
  const firstNumber = Number(first.replace(/[$,%\s]/g, ""));
  const secondNumber = Number(second.replace(/[$,%\s]/g, ""));
  if (first.trim() !== "" && second.trim() !== "" && Number.isFinite(firstNumber) && Number.isFinite(secondNumber)) return firstNumber - secondNumber;
  // Blanks last either way round is handled by the caller.
  return first.localeCompare(second, "en-AU", { numeric: true, sensitivity: "base" });
};

/** Where merged cells sit: the leftmost cell of each merged row draws the whole width. */
function mergeLayout(data: SheetData) {
  const spans = new Map<string, { columns: number; start: boolean }>();
  const skipped = new Set<string>();
  for (const [row, column, rows, columns] of data.merges) {
    for (let rowIndex = row; rowIndex < row + rows; rowIndex++) {
      spans.set(`${rowIndex}:${column}`, { columns, start: rowIndex === row });
      for (let columnIndex = column + 1; columnIndex < column + columns; columnIndex++) skipped.add(`${rowIndex}:${columnIndex}`);
    }
  }
  return { spans, skipped };
}

export function SheetViewer({
  versionId,
  summaries,
  canEdit,
  panel,
  panels,
  start,
}: {
  /** Opened from a search result: this sheet (1 = the first) and these words searched for. */
  start?: { page?: number; query?: string } | null;
  versionId: string;
  summaries: SheetSummary[];
  canEdit: boolean;
  /** What "documents.sheet" panels were given, and the panels themselves (row sign-offs). */
  panel?: SheetViewerPanelProps;
  panels?: ReactNode[];
}) {
  const [sheets, setSheets] = useState(summaries);
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState<Record<number, SheetData>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [views, setViews] = useState<Record<number, SheetView>>({});
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState("");
  /** The match being shown; -1 until Enter or Next is pressed. */
  const [matchIndex, setMatchIndex] = useState(-1);
  const [columnMenu, setColumnMenu] = useState<number | null>(null);
  const [rowCard, setRowCard] = useState<number | null>(null);
  const [headerSheet, setHeaderSheet] = useState(false);
  const [jump, setJump] = useState<Match | null>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 600 });
  const scroller = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // What other Blocks add through the slot.
  const [slotColumns, setSlotColumns] = useState<Record<string, SheetColumn>>({});
  const [slotFilters, setSlotFilters] = useState<Record<string, (row: number) => boolean>>({});
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const [rowCardElement, setRowCardElement] = useState<HTMLDivElement | null>(null);
  const setColumn = useCallback((id: string, column: SheetColumn | null) => {
    setSlotColumns((current) => {
      if (!column && !(id in current)) return current;
      const next = { ...current };
      if (column) next[id] = column;
      else delete next[id];
      return next;
    });
  }, []);
  const setFilter = useCallback((id: string, filter: ((row: number) => boolean) | null) => {
    setSlotFilters((current) => {
      if (!filter && !(id in current)) return current;
      const next = { ...current };
      if (filter) next[id] = filter;
      else delete next[id];
      return next;
    });
  }, []);
  const extras = useMemo(() => Object.values(slotColumns).sort((first, second) => (first.order ?? 100) - (second.order ?? 100)), [slotColumns]);

  const loading = useRef(new Set<number>());
  const load = useCallback(
    async (index: number) => {
      if (loading.current.has(index)) return;
      loading.current.add(index);
      try {
        const data = await api<SheetData>(`/documents/sheets/${versionId}/${index}`);
        setLoaded((current) => ({ ...current, [index]: data }));
      } catch (error) {
        loading.current.delete(index);
        setLoadError((error as Error).message);
      }
    },
    [versionId],
  );
  useEffect(() => void load(active), [active, load]);
  // Searching looks through every sheet.
  useEffect(() => {
    if (query.trim()) sheets.forEach((_, index) => void load(index));
  }, [query, sheets, load]);

  const data = loaded[active];
  const summary = sheets[active];
  const view = views[active] ?? EMPTY_VIEW;
  const headerRow = data ? Math.min(summary?.headerRow ?? 0, Math.max(0, data.cells.length - 1)) : 0;
  const setView = (change: Partial<SheetView>) => setViews((current) => ({ ...current, [active]: { ...(current[active] ?? EMPTY_VIEW), ...change } }));

  // The rows under the header, filtered and sorted (the view only).
  const bodyRows = useMemo(() => {
    if (!data) return [];
    let rows: number[] = [];
    for (let row = headerRow + 1; row < data.cells.length; row++) rows.push(row);
    for (const [column, values] of Object.entries(view.filters)) {
      const shown = new Set(values);
      rows = rows.filter((row) => shown.has(data.cells[row]![Number(column)] ?? ""));
    }
    for (const filter of Object.values(slotFilters)) rows = rows.filter(filter);
    if (view.sort) {
      const { column, direction } = view.sort;
      rows = [...rows].sort((first, second) => {
        const firstText = data.cells[first]![column] ?? "";
        const secondText = data.cells[second]![column] ?? "";
        if (!firstText.trim() !== !secondText.trim()) return firstText.trim() ? -1 : 1;
        return (direction === "up" ? 1 : -1) * compareText(firstText, secondText);
      });
    }
    return rows;
  }, [data, headerRow, view, slotFilters]);
  const filtered = Object.keys(view.filters).length > 0 || view.sort !== null;
  const slotFiltered = Object.keys(slotFilters).length > 0;
  const bodyCount = data ? Math.max(0, data.cells.length - headerRow - 1) : 0;

  // --- search -----------------------------------------------------------
  const needle = query.trim().toLowerCase();
  const matches = useMemo<Match[]>(() => {
    if (!needle) return [];
    const found: Match[] = [];
    sheets.forEach((_, sheet) => {
      loaded[sheet]?.cells.forEach((cells, row) =>
        cells.forEach((text, column) => {
          if (text.toLowerCase().includes(needle)) found.push({ sheet, row, column });
        }),
      );
    });
    return found;
  }, [needle, loaded, sheets]);
  useEffect(() => setMatchIndex(-1), [needle]);
  const currentMatch = matches[matchIndex] ?? null;

  // From a search result: open that sheet and search, then go to the first match on it.
  const startPending = useRef(false);
  useEffect(() => {
    if (!start) return;
    if (start.page && start.page <= sheets.length) setActive(start.page - 1);
    if (start.query) {
      setQuery(start.query);
      startPending.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.page, start?.query]);
  useEffect(() => {
    if (!startPending.current || !matches.length) return;
    const sheet = (start?.page ?? 1) - 1;
    if (!loaded[sheet]) return;
    startPending.current = false;
    goToMatch(Math.max(0, matches.findIndex((match) => match.sheet === sheet)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);
  const goToMatch = (index: number) => {
    if (!matches.length) return;
    const wrapped = (((index % matches.length) + matches.length) % matches.length);
    setMatchIndex(wrapped);
    const match = matches[wrapped]!;
    if (match.sheet !== active) setActive(match.sheet);
    setJump(match);
  };

  // --- sizes --------------------------------------------------------------
  const rowHeight = ROW_HEIGHT * zoom;
  const fontSize = FONT_SIZE * zoom;
  const numberWidth = ROW_NUMBER_WIDTH * zoom;
  const extraWidths = extras.map((column) => column.width * zoom);
  // The row numbers and the slot's columns stay put on the left.
  const lead = numberWidth + extraWidths.reduce((total, width) => total + width, 0);
  const widths = useMemo(() => (data ? data.columns.map((column) => column.width * zoom) : []), [data, zoom]);
  const lefts = useMemo(() => {
    let left = lead;
    return widths.map((width) => {
      const start = left;
      left += width;
      return start;
    });
  }, [widths, lead]);
  const totalWidth = lead + widths.reduce((total, width) => total + width, 0);
  const layout = useMemo(() => (data ? mergeLayout(data) : { spans: new Map(), skipped: new Set<string>() }), [data]);
  const fills = useMemo(() => new Map((data?.fills ?? []).map(([row, column, colour]) => [`${row}:${column}`, colour])), [data]);

  // Which body rows are on screen.
  const above = headerRow + 1; // rows drawn before the body: titles and the header
  const first = Math.max(0, Math.floor(scroll.top / rowHeight) - above - OVERSCAN);
  const last = Math.min(bodyRows.length, Math.ceil((scroll.top + scroll.height) / rowHeight) - above + OVERSCAN);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScroll({ top: element.scrollTop, height: element.clientHeight }));
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [data]);

  useEffect(() => {
    if (!scroller.current || jump) return;
    scroller.current.scrollTop = 0;
    scroller.current.scrollLeft = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Two-finger pinch and Ctrl + wheel zoom the sheet, not the whole app.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let start: { distance: number; zoom: number } | null = null;
    const distance = (touches: TouchList) => Math.hypot(touches[0]!.clientX - touches[1]!.clientX, touches[0]!.clientY - touches[1]!.clientY);
    const onStart = (event: TouchEvent) => {
      if (event.touches.length === 2) start = { distance: distance(event.touches), zoom: zoomRef.current };
    };
    const onMove = (event: TouchEvent) => {
      if (!start || event.touches.length !== 2) return;
      event.preventDefault();
      setZoom(clampZoom(start.zoom * (distance(event.touches) / start.distance)));
    };
    const onEnd = () => (start = null);
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((value) => clampZoom(value * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: false });
    element.addEventListener("touchend", onEnd);
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("wheel", onWheel);
    };
  }, [data]);

  // Scroll a search match into view (clearing filters that hide it).
  useEffect(() => {
    const element = scroller.current;
    if (!jump || jump.sheet !== active || !data || !element) return;
    let position: number;
    if (jump.row <= headerRow) position = jump.row;
    else {
      const index = bodyRows.indexOf(jump.row);
      if (index < 0) {
        setView({ filters: {} });
        return;
      }
      position = above + index;
    }
    element.scrollTop = Math.max(0, position * rowHeight - element.clientHeight / 3);
    // The row numbers and first column stay put, so line the cell up just past them.
    element.scrollLeft = jump.column === 0 ? 0 : Math.max(0, (lefts[jump.column] ?? 0) - lead - (widths[0] ?? 0) - 16);
    setJump(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, active, data, bodyRows]);

  // --- drawing --------------------------------------------------------------
  const label = (column: number) => (data && data.cells[headerRow]?.[column]?.trim()) || data?.columns[column]?.letter || "";

  const renderRow = (row: number, kind: "title" | "header" | "body") => {
    if (!data) return null;
    const cells = data.cells[row]!;
    const types = data.types[row] ?? "";
    return (
      <div
        key={`${kind}-${row}`}
        role="row"
        aria-rowindex={data.rowNumbers[row]}
        className={cn("flex", kind === "header" && "sticky top-0 z-20 bg-muted font-semibold")}
        style={{ height: rowHeight, width: totalWidth }}
      >
        <button
          type="button"
          role="rowheader"
          onClick={() => kind !== "header" && setRowCard(row)}
          className={cn("sticky left-0 z-10 shrink-0 border-r border-b bg-muted text-center text-muted-foreground tabular-nums", kind !== "header" && "hover:bg-accent", kind === "header" && "z-30")}
          style={{ width: numberWidth, fontSize: fontSize * 0.9 }}
          aria-label={kind === "header" ? `Header row ${data.rowNumbers[row]}` : `Row ${data.rowNumbers[row]}: show as a card`}
        >
          {data.rowNumbers[row]}
        </button>
        {extras.map((extra, index) => (
          <div
            key={`extra-${index}`}
            role={kind === "header" ? "columnheader" : "gridcell"}
            className={cn("sticky z-10 flex shrink-0 items-center justify-center border-r border-b", kind === "header" ? "z-30 bg-muted" : "bg-card")}
            style={{ width: extraWidths[index], minWidth: extraWidths[index], left: numberWidth + extraWidths.slice(0, index).reduce((total, width) => total + width, 0), fontSize }}
          >
            {kind === "header" ? extra.header : kind === "body" ? extra.cell(row) : null}
          </div>
        ))}
        {cells.map((text, column) => {
          const key = `${row}:${column}`;
          if (layout.skipped.has(key)) return null;
          const span = layout.spans.get(key);
          const width = span ? widths.slice(column, column + span.columns).reduce((total, value) => total + value, 0) : widths[column]!;
          const shownText = span && !span.start ? "" : text;
          const isMatch = !!needle && !!shownText && shownText.toLowerCase().includes(needle);
          const isCurrent = !!currentMatch && currentMatch.sheet === active && currentMatch.row === row && currentMatch.column === column;
          const sticky = column === 0;
          const style = { width, minWidth: width, fontSize, lineHeight: `${rowHeight - 1}px`, left: sticky ? lead : undefined, background: fills.get(key) };
          const className = cn(
            "shrink-0 truncate border-r border-b px-1.5",
            types[column] === "n" && "text-right tabular-nums",
            sticky && "sticky z-10",
            sticky && !fills.get(key) && (kind === "header" ? "bg-muted" : "bg-card"),
            isMatch && "bg-primary/25",
            isCurrent && "ring-2 ring-primary ring-inset",
          );
          if (kind === "header")
            return (
              <button key={key} type="button" role="columnheader" title={text} onClick={() => setColumnMenu(column)} className={cn(className, "text-left hover:bg-accent", sticky && "z-30")} style={style}>
                {shownText}
                {view.sort?.column === column && (view.sort.direction === "up" ? " ↑" : " ↓")}
                {view.filters[column] && " ⏷"}
              </button>
            );
          return (
            <div key={key} role="gridcell" title={shownText.length > 12 ? shownText : undefined} className={className} style={style}>
              {shownText}
            </div>
          );
        })}
      </div>
    );
  };

  const sheetInfo = useMemo<SheetInfo | null>(
    () => (data && summary ? { index: active, name: summary.name, headerRow, rowNumbers: data.rowNumbers, cells: data.cells } : null),
    [data, summary, active, headerRow],
  );
  const slot: SheetSlotValue | null = panel
    ? { panel, sheet: sheetInfo, setColumn, setFilter, toolbar, rowCard: data && rowCard != null ? { row: rowCard, element: rowCardElement } : null }
    : null;

  if (!sheets.length) return <p className="py-10 text-center text-muted-foreground">This spreadsheet has nothing in it to show.</p>;

  const viewer = (
    <div className="flex flex-col gap-2">
      {/* Search, zoom and the view */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput label="Search the spreadsheet" placeholder="Search the spreadsheet" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            goToMatch(event.shiftKey ? matchIndex - 1 : matchIndex + 1);
          }} className="min-w-48 flex-1" />
        {needle && (
          <div className="flex items-center gap-1">
            <span className="min-w-16 text-center text-sm text-muted-foreground tabular-nums" aria-live="polite">
              {!matches.length ? "No matches" : matchIndex < 0 ? `${matches.length} found` : `${matchIndex + 1} of ${matches.length}`}
            </span>
            <Button variant="ghost" size="icon" aria-label="Previous match" disabled={!matches.length} onClick={() => goToMatch(matchIndex - 1)}>
              <ChevronUp />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Next match" disabled={!matches.length} onClick={() => goToMatch(matchIndex + 1)}>
              <ChevronDown />
            </Button>
          </div>
        )}
        <div className="ml-auto flex items-center">
          <Button variant="ghost" size="icon" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((value) => clampZoom(value / 1.25))}>
            <Minus />
          </Button>
          <button type="button" onClick={() => setZoom(1)} className="min-h-touch w-14 text-center text-sm font-semibold tabular-nums" aria-label="Back to 100%">
            {Math.round(zoom * 100)}%
          </button>
          <Button variant="ghost" size="icon" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((value) => clampZoom(value * 1.25))}>
            <Plus />
          </Button>
        </div>
      </div>
      {/* Other Blocks' bits (progress, To do / Signed off…) */}
      <div ref={setToolbar} className="flex flex-wrap items-center gap-2 empty:hidden" />
      {(filtered || slotFiltered || (canEdit && data)) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {(filtered || slotFiltered) && (
            <span>
              Showing {bodyRows.length} of {bodyCount} rows{view.sort ? `, sorted by ${label(view.sort.column)}` : ""}
            </span>
          )}
          {filtered && (
            <Button variant="outline" size="sm" onClick={() => setView({ filters: {}, sort: null })}>
              <X /> Clear
            </Button>
          )}
          {canEdit && data && (
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setHeaderSheet(true)}>
              Header row: {data.rowNumbers[headerRow]}
            </Button>
          )}
        </div>
      )}

      {/* The grid */}
      <div className="paper overflow-hidden rounded-md border">
        <div ref={scroller} role="grid" aria-label={summary?.name} aria-rowcount={data?.cells.length} className="relative h-[calc(100dvh-16rem)] min-h-80 overflow-auto overscroll-contain bg-card text-foreground" style={{ touchAction: "pan-x pan-y" }}>
          {loadError && !data ? (
            <p className="p-6 text-center text-destructive">Couldn&apos;t load this sheet: {loadError}</p>
          ) : !data ? (
            <p className="p-6 text-center text-muted-foreground">Loading {summary?.name}…</p>
          ) : (
            <div style={{ width: totalWidth }}>
              {Array.from({ length: headerRow }, (_, row) => renderRow(row, "title"))}
              {data.cells.length > 0 && renderRow(headerRow, "header")}
              <div style={{ height: first * rowHeight }} />
              {bodyRows.slice(first, Math.max(first, last)).map((row) => renderRow(row, "body"))}
              <div style={{ height: Math.max(0, bodyRows.length - Math.max(first, last)) * rowHeight }} />
              {(filtered || slotFiltered) && bodyRows.length === 0 && <p className="sticky left-0 p-6 text-sm text-muted-foreground">No rows match the filter.</p>}
            </div>
          )}
        </div>
      </div>

      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <Scroller axis="x" className="flex gap-1" role="tablist" aria-label="Sheets">
          {sheets.map((sheet, index) => (
            <button
              key={sheet.name}
              type="button"
              role="tab"
              aria-selected={index === active}
              onClick={() => setActive(index)}
              className={cn("min-h-touch shrink-0 rounded-md px-4 text-sm font-semibold whitespace-nowrap", index === active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}
            >
              {sheet.name}
            </button>
          ))}
        </Scroller>
      )}

      {data && columnMenu != null && (
        <ColumnSheet
          title={label(columnMenu)}
          values={(() => {
            const counts = new Map<string, number>();
            for (let row = headerRow + 1; row < data.cells.length; row++) {
              const value = data.cells[row]![columnMenu] ?? "";
              counts.set(value, (counts.get(value) ?? 0) + 1);
            }
            return [...counts.entries()].sort(([first], [second]) => (!first !== !second ? (first ? -1 : 1) : compareText(first, second)));
          })()}
          shown={view.filters[columnMenu] ?? null}
          sort={view.sort?.column === columnMenu ? view.sort.direction : null}
          onShown={(values) => {
            const filters = { ...view.filters };
            if (values) filters[columnMenu] = values;
            else delete filters[columnMenu];
            setView({ filters });
          }}
          onSort={(direction) => setView({ sort: direction ? { column: columnMenu, direction } : null })}
          onClose={() => setColumnMenu(null)}
        />
      )}
      {data && rowCard != null && (
        <Sheet open onOpenChange={(open) => !open && setRowCard(null)}>
          <SheetContent title={`Row ${data.rowNumbers[rowCard]}`} description={summary?.name}>
            <dl className="flex flex-col divide-y px-4 pb-4">
              {data.cells[rowCard]!.map((text, column) =>
                text.trim() ? (
                  <div key={column} className="flex flex-col gap-0.5 py-2">
                    <dt className="text-sm text-muted-foreground">{label(column)}</dt>
                    <dd className="break-words whitespace-pre-wrap">{text}</dd>
                  </div>
                ) : null,
              )}
            </dl>
            <div ref={setRowCardElement} className="px-4 empty:hidden" />
            <FormActions>
              <Button variant="outline" disabled={bodyRows.indexOf(rowCard) <= 0} onClick={() => setRowCard(bodyRows[bodyRows.indexOf(rowCard) - 1]!)}>
                <ChevronUp /> Previous
              </Button>
              <Button variant="outline" disabled={bodyRows.indexOf(rowCard) < 0 || bodyRows.indexOf(rowCard) >= bodyRows.length - 1} onClick={() => setRowCard(bodyRows[bodyRows.indexOf(rowCard) + 1]!)}>
                Next <ChevronDown />
              </Button>
            </FormActions>
          </SheetContent>
        </Sheet>
      )}
      {data && summary && headerSheet && (
        <HeaderRowSheet
          rowNumbers={data.rowNumbers}
          summary={summary}
          onClose={() => setHeaderSheet(false)}
          onSave={async (headerRow) => {
            const result = await api<{ sheets: SheetSummary[] }>(`/documents/version/${versionId}/sheets/${active}`, { method: "PATCH", body: { headerRow } });
            setSheets(result.sheets);
            setView({ filters: {}, sort: null });
            setHeaderSheet(false);
          }}
        />
      )}
    </div>
  );

  if (!slot) return viewer;
  return (
    <SheetSlotProvider value={slot}>
      {viewer}
      {panels}
    </SheetSlotProvider>
  );
}

/** Tap a column's header: sort it, or pick which values to show. */
function ColumnSheet({
  title,
  values,
  shown,
  sort,
  onShown,
  onSort,
  onClose,
}: {
  title: string;
  values: [string, number][];
  /** null: every value shows (no filter). */
  shown: string[] | null;
  sort: "up" | "down" | null;
  onShown: (values: string[] | null) => void;
  onSort: (direction: "up" | "down" | null) => void;
  onClose: () => void;
}) {
  const [find, setFind] = useState("");
  const selected = new Set(shown ?? values.map(([value]) => value));
  const listed = find.trim() ? values.filter(([value]) => value.toLowerCase().includes(find.trim().toLowerCase())) : values;
  const toggle = (value: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(value);
    else next.delete(value);
    onShown(next.size === values.length ? null : [...next]);
  };
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title={title || "Column"} description="Changes what you see here, never the file.">
        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="grid grid-cols-2 gap-2">
            <Button variant={sort === "up" ? "default" : "outline"} onClick={() => onSort(sort === "up" ? null : "up")}>
              Sort A to Z
            </Button>
            <Button variant={sort === "down" ? "default" : "outline"} onClick={() => onSort(sort === "down" ? null : "down")}>
              Sort Z to A
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Show</span>
            <span className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => onShown(null)}>
                All
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onShown([])}>
                None
              </Button>
            </span>
          </div>
          {values.length > 12 && <SearchInput label="Find a value" placeholder="Find a value" value={find} onChange={(event) => setFind(event.target.value)} />}
          <ul className="flex flex-col">
            {listed.map(([value, count]) => (
              <li key={value}>
                <label className="flex min-h-touch items-center gap-3">
                  <Checkbox checked={selected.has(value)} onCheckedChange={(checked) => toggle(value, checked === true)} />
                  <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground italic")}>{value || "(Blank)"}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">{count}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Which row holds the column names, for this version of the file. */
function HeaderRowSheet({ rowNumbers, summary, onSave, onClose }: { rowNumbers: number[]; summary: SheetSummary; onSave: (headerRow: number) => Promise<void>; onClose: () => void }) {
  const [value, setValue] = useState(String(rowNumbers[summary.headerRow] ?? 1));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (index: number) => {
    setBusy(true);
    try {
      await onSave(index);
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title="Header row" description={`The row with the column names on ${summary.name}. It stays at the top while you scroll, and names each line on a row card.`}>
        <form
          className="flex flex-col gap-3 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            const index = rowNumbers.indexOf(Number(value));
            if (index < 0) return setError("That row isn't on this sheet (or it's hidden).");
            void save(index);
          }}
        >
          <Field label="Row number" inputMode="numeric" value={value} onChange={(event) => (setValue(event.target.value), setError(null))} error={error ?? undefined} />
          {summary.headerRow !== summary.guessedHeaderRow && (
            <Button type="button" variant="ghost" className="self-start" disabled={busy} onClick={() => void save(summary.guessedHeaderRow)}>
              Put back Grid&apos;s guess (row {rowNumbers[summary.guessedHeaderRow]})
            </Button>
          )}
          <FormActions>
            <Button type="submit" disabled={busy}>
              Save
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}
