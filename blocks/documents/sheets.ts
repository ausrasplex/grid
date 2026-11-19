// Reading a spreadsheet (Excel, OpenDocument or CSV) into what the
// spreadsheet viewer shows: one compact JSON per sheet with the cell text
// as the file shows it (number and date formats applied, formulas at their
// last saved value), column widths, merged cells, fills, and hidden rows
// and columns left out. Done once per version in the background
// ("documents.render"); the phone downloads this, not the file.
// SheetJS (from cdn.sheetjs.com, not the stale npm copy).

import * as XLSX from "xlsx";

/** One sheet as the viewer draws it. Rows and columns are the shown ones only. */
export interface SheetData {
  name: string;
  /** The file's row number (1, 2, 3…) of each shown row, so hidden rows don't renumber the rest. */
  rowNumbers: number[];
  /** Each shown column: its letter in the file and its width in pixels. */
  columns: { letter: string; width: number }[];
  /** Cell text, row by row ("" when empty). */
  cells: string[][];
  /** Per row, one character per column: "n" for numbers and dates (right-aligned), "." otherwise. */
  types: string[];
  /** Merged cells: [row, column, rows, columns] in shown positions. */
  merges: [number, number, number, number][];
  /** Background fills: [row, column, "#rrggbb"]. */
  fills: [number, number, string][];
}

/** What's kept on the version (`DocumentVersion.sheets`): enough to draw the tabs and pick the header. */
export interface SheetSummary {
  name: string;
  rows: number;
  columns: number;
  /** The header row, as a shown row index (0 = the first row). Changeable per version. */
  headerRow: number;
  /** What Grid guessed, so it can be put back. */
  guessedHeaderRow: number;
}

/** Excel's default column (8.43 characters) is 64 px. */
const DEFAULT_WIDTH = 64;
const widthOf = (column: XLSX.ColInfo | undefined) => {
  const pixels = column?.wpx ?? (column?.wch != null ? column.wch * 7 + 5 : column?.width != null ? column.width * 7 + 5 : DEFAULT_WIDTH);
  return Math.round(Math.min(800, Math.max(24, pixels)));
};

/** The first "full" row in the top 30: at least 60% as many filled cells as the fullest row there (and 2 or more). */
export function guessHeaderRow(cells: string[][]): number {
  const counts = cells.slice(0, 30).map((row) => row.filter((value) => value.trim() !== "").length);
  const fullest = Math.max(0, ...counts);
  const needed = Math.max(2, Math.ceil(fullest * 0.6));
  const index = counts.findIndex((count) => count >= needed);
  return index < 0 ? 0 : index;
}

const isHex = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{6,8}$/i.test(value);

/** A cell's text as the file shows it. */
function textOf(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.t === "z") return "";
  if (cell.w != null) return String(cell.w);
  if (cell.v == null) return "";
  if (cell.v instanceof Date) return cell.v.toLocaleDateString("en-AU");
  return String(cell.v);
}

/**
 * Reads a whole file. `csv` keeps every value as typed (so "0012" stays
 * "0012"). Hidden sheets are left out.
 */
export function readWorkbook(file: Buffer, options: { csv?: boolean } = {}): SheetData[] {
  const workbook = XLSX.read(file, { type: "buffer", dense: true, cellStyles: true, cellFormula: false, cellHTML: false, raw: !!options.csv });
  const hidden = new Set((workbook.Workbook?.Sheets ?? []).flatMap((sheet, index) => (sheet.Hidden ? [workbook.SheetNames[index]] : [])));
  return workbook.SheetNames.filter((name) => !hidden.has(name)).map((name) => readSheet(name, workbook.Sheets[name]!));
}

function readSheet(name: string, sheet: XLSX.WorkSheet): SheetData {
  const data = (sheet["!data"] ?? []) as (XLSX.CellObject[] | undefined)[];
  // The real size: the last row and column with something in them (a sheet's
  // own range often claims far more).
  let lastRow = -1;
  let lastColumn = -1;
  data.forEach((row, rowIndex) => {
    row?.forEach((cell, columnIndex) => {
      if (textOf(cell) === "") return;
      if (rowIndex > lastRow) lastRow = rowIndex;
      if (columnIndex > lastColumn) lastColumn = columnIndex;
    });
  });
  const rowInfo = sheet["!rows"] ?? [];
  const columnInfo = sheet["!cols"] ?? [];
  const shownRows: number[] = [];
  for (let row = 0; row <= lastRow; row++) if (!rowInfo[row]?.hidden) shownRows.push(row);
  const shownColumns: number[] = [];
  for (let column = 0; column <= lastColumn; column++) if (!columnInfo[column]?.hidden) shownColumns.push(column);
  const rowAt = new Map(shownRows.map((row, index) => [row, index]));
  const columnAt = new Map(shownColumns.map((column, index) => [column, index]));

  const cells: string[][] = [];
  const types: string[] = [];
  const fills: [number, number, string][] = [];
  shownRows.forEach((row, rowIndex) => {
    const source = data[row];
    const texts: string[] = [];
    let kinds = "";
    shownColumns.forEach((column, columnIndex) => {
      const cell = source?.[column];
      texts.push(textOf(cell));
      kinds += cell && (cell.t === "n" || cell.t === "d") ? "n" : ".";
      // Solid fills only (the community edition of SheetJS reads fills, not fonts).
      const style = cell?.s as { patternType?: string; fgColor?: { rgb?: unknown } } | undefined;
      const colour = style?.fgColor?.rgb;
      if (style?.patternType === "solid" && isHex(colour)) {
        const hex = colour.slice(-6).toLowerCase();
        if (hex !== "ffffff") fills.push([rowIndex, columnIndex, `#${hex}`]);
      }
    });
    cells.push(texts);
    types.push(kinds);
  });

  // Merged cells, moved to shown positions (hidden rows and columns shrink them).
  const merges: [number, number, number, number][] = [];
  for (const merge of sheet["!merges"] ?? []) {
    const rows = shownRows.filter((row) => row >= merge.s.r && row <= merge.e.r);
    const columns = shownColumns.filter((column) => column >= merge.s.c && column <= merge.e.c);
    if (!rows.length || !columns.length || (rows.length === 1 && columns.length === 1)) continue;
    merges.push([rowAt.get(rows[0]!)!, columnAt.get(columns[0]!)!, rows.length, columns.length]);
  }

  return {
    name,
    rowNumbers: shownRows.map((row) => row + 1),
    columns: shownColumns.map((column) => ({ letter: XLSX.utils.encode_col(column), width: widthOf(columnInfo[column]) })),
    cells,
    types,
    merges,
    fills,
  };
}

/** The summary kept on the version, with Grid's guess at each header row. */
export function summarise(sheets: SheetData[]): SheetSummary[] {
  return sheets.map((sheet) => {
    const guessed = guessHeaderRow(sheet.cells);
    return { name: sheet.name, rows: sheet.cells.length, columns: sheet.columns.length, headerRow: guessed, guessedHeaderRow: guessed };
  });
}

/** Columns another Block adds to a copy of a sheet: a heading on the header row, then values by the file's row number. */
export interface AddedColumns {
  /** The file's row number (1-based) of the header row. */
  headerRowNumber: number;
  headers: string[];
  /** File row number → one value per header. */
  rows: Map<number, string[]>;
}

/**
 * A copy of the workbook with columns added after each named sheet's last
 * column ("Download with sign-offs"). The original file is never changed.
 * Comes back as .xlsx, whatever went in (a CSV gains a proper sheet).
 */
export function addColumns(file: Buffer, additions: Record<string, AddedColumns>, options: { csv?: boolean } = {}): Buffer {
  const workbook = XLSX.read(file, { type: "buffer", dense: true, cellStyles: true, raw: !!options.csv });
  for (const [name, added] of Object.entries(additions)) {
    const sheet = workbook.Sheets[name];
    if (!sheet || !added.headers.length) continue;
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    const column = range.e.c + 1;
    XLSX.utils.sheet_add_aoa(sheet, [added.headers], { origin: { r: added.headerRowNumber - 1, c: column } });
    for (const [rowNumber, values] of added.rows) XLSX.utils.sheet_add_aoa(sheet, [values], { origin: { r: rowNumber - 1, c: column } });
    const columns = sheet["!cols"] ?? [];
    added.headers.forEach((header, index) => (columns[column + index] = { wch: Math.max(12, header.length + 2) }));
    sheet["!cols"] = columns;
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
