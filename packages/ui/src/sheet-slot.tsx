"use client";

// The spreadsheet viewer's slot (docs/documents-block.md, "Spreadsheet
// viewer"): lets other Blocks add to the viewer without the Documents Block
// knowing about them, the same way plan-overlay.tsx does for plans. Each
// Block adds a panel to the "documents.sheet" slot (props:
// SheetViewerPanelProps); inside it, these hooks add:
//   - a column at the start of every row (row sign-offs' box)
//   - a filter on which rows show ("To do")
//   - things in the bar above the sheet (progress, menus)
//   - lines on the row card (who signed it off, a note)

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** What the document page passes to every "documents.sheet" panel (plus ctx). */
export interface SheetViewerPanelProps {
  document: { id: string; title: string; projectId: string | null };
  /** The version on screen; `isCurrent` is false for an older one (look, don't change). */
  version: { id: string; isCurrent: boolean };
}

/** The sheet on screen, as the viewer has it. Rows are shown rows (hidden ones left out). */
export interface SheetInfo {
  index: number;
  name: string;
  /** The header row, as a row index. Rows after it are the body. */
  headerRow: number;
  /** The file's row number of each row (for "Row 12"). */
  rowNumbers: number[];
  /** Cell text, row by row. */
  cells: string[][];
}

/** A column a Block adds at the start of each row. */
export interface SheetColumn {
  /** Width at 100% zoom, in pixels. */
  width: number;
  /** In the header row. */
  header: ReactNode;
  /** One body row (a row index into `cells`). Kept small: it's drawn for every row on screen. */
  cell: (row: number) => ReactNode;
  /** Sorts it among other Blocks' columns (lower first). Default 100. */
  order?: number;
}

export interface SheetSlotValue {
  panel: SheetViewerPanelProps;
  /** Null while the sheet loads. */
  sheet: SheetInfo | null;
  setColumn: (id: string, column: SheetColumn | null) => void;
  /** Rows that pass every Block's filter show (the column filters still apply too). */
  setFilter: (id: string, filter: ((row: number) => boolean) | null) => void;
  /** The bar above the sheet. */
  toolbar: HTMLElement | null;
  /** The row card's extra lines, while one is open. */
  rowCard: { row: number; element: HTMLElement | null } | null;
}

const SheetSlotContext = createContext<SheetSlotValue | null>(null);

export function SheetSlotProvider({ value, children }: { value: SheetSlotValue; children: ReactNode }) {
  return <SheetSlotContext.Provider value={value}>{children}</SheetSlotContext.Provider>;
}

/** The spreadsheet viewer this component sits in. */
export function useSheetSlot(): SheetSlotValue {
  const value = useContext(SheetSlotContext);
  if (!value) throw new Error("useSheetSlot() must be used inside the spreadsheet viewer");
  return value;
}

let counter = 0;
const useSlotId = (prefix: string) => {
  const ref = useRef<string | null>(null);
  if (!ref.current) ref.current = `${prefix}-${++counter}`;
  return ref.current;
};

/** Adds a column at the start of every row while mounted (null removes it). */
export function useSheetColumn(column: SheetColumn | null) {
  const { setColumn } = useSheetSlot();
  const id = useSlotId("column");
  useEffect(() => setColumn(id, column), [id, column, setColumn]);
  useEffect(() => () => setColumn(id, null), [id, setColumn]);
}

/** Hides rows that don't pass `filter` while mounted (null shows them all). */
export function useSheetFilter(filter: ((row: number) => boolean) | null) {
  const { setFilter } = useSheetSlot();
  const id = useSlotId("filter");
  useEffect(() => setFilter(id, filter), [id, filter, setFilter]);
  useEffect(() => () => setFilter(id, null), [id, setFilter]);
}

/** Puts children in the bar above the sheet. */
export function SheetToolbar({ children }: { children: ReactNode }) {
  const { toolbar } = useSheetSlot();
  return toolbar ? createPortal(children, toolbar) : null;
}

/** Puts children on the open row card (`row` says which). */
export function SheetRowCard({ children }: { children: (row: number) => ReactNode }) {
  const { rowCard } = useSheetSlot();
  return rowCard?.element ? createPortal(children(rowCard.row), rowCard.element) : null;
}
