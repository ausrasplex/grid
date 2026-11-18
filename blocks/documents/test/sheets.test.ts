import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { guessHeaderRow, readWorkbook, summarise } from "../sheets.ts";

/** An .xlsx file in memory, built from rows. */
function workbookFile(sheets: { name: string; rows: unknown[][]; setup?: (sheet: XLSX.WorkSheet) => void; hidden?: boolean }[]): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    sheet.setup?.(worksheet);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  sheets.forEach((sheet, index) => {
    if (!sheet.hidden) return;
    workbook.Workbook ??= {};
    workbook.Workbook.Sheets ??= workbook.SheetNames.map(() => ({}));
    workbook.Workbook.Sheets[index]!.Hidden = 1;
  });
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("reads cell text, numbers and trims empty edges", () => {
  const [sheet] = readWorkbook(
    workbookFile([
      {
        name: "Points",
        rows: [
          ["Point name", "Level", "Qty"],
          ["AHU-01 SAT", "Level 2", 4],
          ["AHU-02 SAT", "Level 3", 12.5],
        ],
      },
    ]),
  );
  assert.equal(sheet!.name, "Points");
  assert.deepEqual(sheet!.cells, [
    ["Point name", "Level", "Qty"],
    ["AHU-01 SAT", "Level 2", "4"],
    ["AHU-02 SAT", "Level 3", "12.5"],
  ]);
  assert.deepEqual(sheet!.types, ["...", "..n", "..n"]);
  assert.deepEqual(sheet!.rowNumbers, [1, 2, 3]);
  assert.deepEqual(sheet!.columns.map((column) => column.letter), ["A", "B", "C"]);
});

test("hidden rows, columns and sheets are left out, keeping the file's row numbers", () => {
  const sheets = readWorkbook(
    workbookFile([
      {
        name: "Fit-off",
        rows: [
          ["Circuit", "Secret", "Room"],
          ["L1", "x", "Kitchen"],
          ["L2", "y", "Bath"],
          ["L3", "z", "Laundry"],
        ],
        setup: (worksheet) => {
          worksheet["!cols"] = [{ wch: 10 }, { hidden: true }, { wpx: 200 }];
          worksheet["!rows"] = [{}, {}, { hidden: true }];
        },
      },
      { name: "Workings", rows: [["hidden"]], hidden: true },
    ]),
  );
  assert.deepEqual(sheets.map((sheet) => sheet.name), ["Fit-off"]);
  const sheet = sheets[0]!;
  assert.deepEqual(sheet.cells, [
    ["Circuit", "Room"],
    ["L1", "Kitchen"],
    ["L3", "Laundry"],
  ]);
  assert.deepEqual(sheet.rowNumbers, [1, 2, 4]);
  assert.deepEqual(sheet.columns.map((column) => column.letter), ["A", "C"]);
  assert.equal(sheet.columns[1]!.width, 200);
});

test("merged cells move to shown positions", () => {
  const [sheet] = readWorkbook(
    workbookFile([
      {
        name: "Schedule",
        rows: [
          ["Level 2 lighting schedule", null, null],
          ["Tag", "Type", "Qty"],
          ["D1", "Downlight", 24],
        ],
        setup: (worksheet) => {
          worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
        },
      },
    ]),
  );
  assert.deepEqual(sheet!.merges, [[0, 0, 1, 3]]);
});

test("CSV keeps values as typed", () => {
  const [sheet] = readWorkbook(Buffer.from("Code,Name\n0012,Smoke alarm\n"), { csv: true });
  assert.deepEqual(sheet!.cells, [
    ["Code", "Name"],
    ["0012", "Smoke alarm"],
  ]);
});

test("the header row is the first full row", () => {
  assert.equal(guessHeaderRow([["Level 2 points list"], [""], ["Point", "Type", "Controller", "Address"], ["A", "AI", "C1", "1"]]), 2);
  assert.equal(guessHeaderRow([["Tag", "Qty"], ["D1", "3"]]), 0);
  assert.equal(guessHeaderRow([]), 0);
  const [summary] = summarise(readWorkbook(Buffer.from("Title\n\nA,B,C\n1,2,3\n"), { csv: true }));
  assert.deepEqual(summary, { name: "Sheet1", rows: 4, columns: 3, headerRow: 2, guessedHeaderRow: 2 });
});
