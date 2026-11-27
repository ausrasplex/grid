import { test } from "node:test";
import assert from "node:assert/strict";
import { codeKey, findHeadingRow, guessColumns, parseMoney, planPriceList, plainUnit, readPriceList, savedColumnsFor, sellWithMarkup, type PlanItem } from "../price-list.ts";

// A wholesaler's export: their name and account above the table, list and nett prices, cable priced per 100 m.
const file: unknown[][] = [
  ["Sparky Wholesale Pty Ltd", "", "", "", "", "", ""],
  ["Account 12345 · Prices current 1/12/2026", "", "", "", "", "", ""],
  ["", "", "", "", "", "", ""],
  ["Stock Code", "Description", "Brand", "UOM", "List Price", "Nett Price", "Per"],
  ["2025WE", "Double GPO 10A White", "Clipsal", "EA", "$18.40", "$9.85", "1"],
  ["TPS2.5-100", "2.5mm TPS cable", "Olex", "MTR", "320.00", "185.00", "100"],
  ["", "SWITCHES", "", "", "", "", ""],
  ["30M", "Switch mech", "Clipsal", "EA", "4.10", "POA", "1"],
  ["", "Mystery item", "", "", "", "2.00", ""],
  ["2025WE", "Double GPO (again)", "Clipsal", "EA", "18.40", "9.90", "1"],
];

test("finds the heading row under the wholesaler's letterhead", () => {
  assert.equal(findHeadingRow(file), 3);
});

test("guesses columns, and picks the nett price over the list price", () => {
  const map = guessColumns(file[3] as string[]);
  assert.deepEqual(map, { code: 0, description: 1, cost: 5, per: 6, unit: 3, brand: 2 });
});

test("saved headings win, even when the columns have moved", () => {
  const moved = ["Description", "Price Ex GST", "Item #", "Nett Price"];
  assert.equal(guessColumns(moved, { cost: "Price Ex GST", code: "Item #" }).cost, 1);
  assert.equal(guessColumns(moved, { cost: "Price Ex GST", code: "Item #" }).code, 2);
  assert.deepEqual(savedColumnsFor(file[3] as string[], { code: 0, cost: 5 }), { code: "Stock Code", cost: "Nett Price" });
});

test("reads products: per divides the price, units in plain words, bad rows reported", () => {
  const { rows, skipped } = readPriceList(file, 3, guessColumns(file[3] as string[]));
  assert.deepEqual(rows[0], { code: "2025WE", description: "Double GPO 10A White", cost: 9.85, unit: "each", brand: "Clipsal" });
  assert.equal(rows[1]!.cost, 1.85);
  assert.equal(rows[1]!.unit, "m");
  assert.equal(rows.length, 3);
  assert.deepEqual(skipped, [
    { line: 8, reason: 'No price (it says "POA")' },
    { line: 9, reason: "No supplier code" },
  ]);
});

test("money and units", () => {
  assert.equal(parseMoney("$1,234.50"), 1234.5);
  assert.equal(parseMoney("12.30 ea"), 12.3);
  assert.equal(parseMoney(7), 7);
  assert.equal(parseMoney("POA"), null);
  assert.equal(parseMoney(""), null);
  assert.equal(plainUnit("LGTH"), "length");
  assert.equal(plainUnit("Bag"), "bag");
  assert.equal(codeKey(" CLI-2025 we "), "cli2025we");
  assert.equal(sellWithMarkup(9.85, 30), 12.81);
  assert.equal(sellWithMarkup(9.85, null), 9.85);
});

const items: PlanItem[] = [
  { id: "gpo", name: "Double GPO", supplier: "Sparky Wholesale", supplierCode: "2025we", cost: 9.5, sell: 19 },
  { id: "cable", name: "2.5 TPS", supplier: null, supplierCode: "TPS2.5-100", cost: null, sell: 3 },
  { id: "other", name: "Same code, other supplier", supplier: "Someone Else", supplierCode: "2025WE", cost: 5, sell: 10 },
  { id: "gone", name: "Old switch", supplier: "sparky wholesale", supplierCode: "OLD1", cost: 2, sell: 4 },
  { id: "same", name: "Already right", supplier: "Sparky Wholesale", supplierCode: "30M", cost: 4.1, sell: 8 },
];
const listRows = [
  { code: "2025WE", cost: 9.85 },
  { code: "TPS2.5-100", cost: 1.85 },
  { code: "30M", cost: 4.1 },
  { code: "NEW1", cost: 50 },
  { code: "2025WE", cost: 9.9 },
];

test("plan: matches by code for this supplier, keeps the markup, reports the rest", () => {
  const plan = planPriceList("Sparky Wholesale", listRows, items, "KEEP_MARKUP");
  assert.deepEqual(
    plan.changes.map((change) => [change.itemId, change.costBefore, change.costAfter, change.sellAfter, change.setsSupplier]),
    [
      ["gpo", 9.5, 9.85, 19.7, false],
      // No cost before: the sell price stays, and it gets the supplier.
      ["cable", null, 1.85, 3, true],
    ],
  );
  assert.equal(plan.unchanged, 1);
  assert.deepEqual(plan.matchedCodes.sort(), ["2025we", "30m", "tps25100"]);
  assert.deepEqual(plan.duplicateCodes, ["2025WE"]);
  assert.deepEqual(plan.notOnList, [{ id: "gone", name: "Old switch", code: "OLD1" }]);
});

test("plan: keep sell prices leaves them alone", () => {
  const plan = planPriceList("Sparky Wholesale", listRows, items, "KEEP_SELL");
  assert.equal(plan.changes[0]!.sellAfter, 19);
});
