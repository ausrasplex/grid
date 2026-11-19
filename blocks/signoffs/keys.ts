// Which row a sign-off belongs to (docs/documents-block.md, "Row sign-offs").
// Sign-offs are kept in Grid, never in the file, so each row needs a key
// that survives a new version reordering or adding rows:
//   - the sheet's match column (Point name, Tag, Circuit…), "c:<value>"
//   - or, with none (or a blank value), the whole row's text, "h:<hash>"
// Two rows with the same value get "#2", "#3"… in order. Shared by the
// phone and the server (Download with sign-offs), so no server code here.

/** Header names that usually name a row, best first. */
const MATCH_NAMES = ["point name", "point", "point id", "tag", "tag no", "tag number", "circuit", "circuit no", "circuit number", "id", "ref", "reference", "device", "address", "name"];

/** "Point Name:" → "point name". */
export const normalise = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The header text of each column on the header row. */
export const headersOf = (cells: string[][], headerRow: number) => (cells[headerRow] ?? []).map((text) => text.trim());

/**
 * Grid's guess at the match column: the first header (in MATCH_NAMES order)
 * that names most rows and rarely repeats. Null: match by the whole row.
 */
export function guessMatchColumn(cells: string[][], headerRow: number): string | null {
  const headers = headersOf(cells, headerRow);
  const body = cells.slice(headerRow + 1).filter((row) => row.some((text) => text.trim() !== ""));
  if (!body.length) return null;
  for (const name of MATCH_NAMES) {
    const column = headers.findIndex((header) => normalise(header) === name);
    if (column < 0) continue;
    const values = body.map((row) => (row[column] ?? "").trim()).filter(Boolean);
    if (values.length < body.length * 0.6) continue;
    if (new Set(values.map(normalise)).size < values.length * 0.9) continue;
    return headers[column]!;
  }
  return null;
}

/** The column a saved setting points at: null = Grid's guess, "" = whole row, else a header name. */
export function matchColumnFor(cells: string[][], headerRow: number, setting: string | null): string | null {
  if (setting === "") return null;
  if (setting === null) return guessMatchColumn(cells, headerRow);
  return headersOf(cells, headerRow).some((header) => normalise(header) === normalise(setting)) ? setting : null;
}

/** FNV-1a, 32 bits, as hex: short and the same on every device. */
export function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(16).padStart(8, "0");
}

/**
 * Each row's key (null for rows above and on the header, and blank rows).
 * `matchColumn` is a header name, or null for whole-row matching.
 */
export function rowKeys(cells: string[][], headerRow: number, matchColumn: string | null): (string | null)[] {
  const column = matchColumn === null ? -1 : headersOf(cells, headerRow).findIndex((header) => normalise(header) === normalise(matchColumn));
  const seen = new Map<string, number>();
  return cells.map((row, index) => {
    if (index <= headerRow || !row.some((text) => text.trim() !== "")) return null;
    const value = column >= 0 ? normalise(row[column] ?? "") : "";
    const base = value && value.length <= 120 ? `c:${value}` : `h:${hash(row.map((text) => normalise(text)).join("\u0001"))}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  });
}

/** A short reminder of a row ("AHU-1-SAT · AI · Level 2"), kept with a sign-off in case the row stops matching. */
export const rowText = (row: string[]) =>
  row
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" · ")
    .slice(0, 200);

/** One sign-off or undo, as the phone and the server pass it around. */
export interface SignoffEntry {
  id: string;
  sheetName: string;
  rowKey: string;
  signedOff: boolean;
  note: string | null;
  rowText: string;
  byId: string;
  byName: string;
  /** ISO time it was done (on the phone, which may have been offline). */
  at: string;
}

/** Where a row stands: signed off (by whom, first in the current run) or not, and its history (oldest first). */
export interface RowState {
  signedOff: boolean;
  /** Who signed it off first in the current run (the first one stands). */
  by: SignoffEntry | null;
  history: SignoffEntry[];
}

/** Every row's state on one sheet, from its entries (any order). */
export function rowStates(entries: SignoffEntry[], sheetName: string): Map<string, RowState> {
  const states = new Map<string, RowState>();
  const mine = entries.filter((entry) => entry.sheetName === sheetName).sort((first, second) => first.at.localeCompare(second.at) || first.id.localeCompare(second.id));
  for (const entry of mine) {
    const state = states.get(entry.rowKey) ?? { signedOff: false, by: null, history: [] };
    state.history.push(entry);
    if (entry.signedOff) {
      if (!state.signedOff) state.by = entry;
      state.signedOff = true;
    } else {
      state.signedOff = false;
      state.by = null;
    }
    states.set(entry.rowKey, state);
  }
  return states;
}
