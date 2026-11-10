import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate, formatMoney, groupBySection, parseMoney, sellFromMarkup, type LineInput } from "../money.ts";

const gstCode = { id: "gst", label: "GST", rate: 0.1 };
const free = { id: "free", label: "GST-free", rate: 0 };
const taxExclusive = { pricesIncludeTax: false, rounding: "LINE" as const, codes: [gstCode, free] };

test("tax-exclusive prices add GST on top", () => {
  const totals = calculate([{ qty: 2, unitCents: 12500, taxCodeId: "gst" }, { qty: 1, unitCents: 9000, taxCodeId: "gst" }], taxExclusive);
  assert.equal(totals.subtotalExCents, 34000);
  assert.equal(totals.taxCents, 3400);
  assert.equal(totals.totalCents, 37400);
});

test("tax-inclusive prices take GST out (1/11th)", () => {
  const totals = calculate([{ qty: 1, unitCents: 11000, taxCodeId: "gst" }], { ...taxExclusive, pricesIncludeTax: true });
  assert.equal(totals.taxCents, 1000);
  assert.equal(totals.subtotalExCents, 10000);
  assert.equal(totals.totalCents, 11000);
});

test("mixed rates are broken down by code", () => {
  const totals = calculate([{ qty: 1, unitCents: 10000, taxCodeId: "gst" }, { qty: 1, unitCents: 5000, taxCodeId: "free" }], taxExclusive);
  assert.deepEqual(totals.taxByCode.map((code) => [code.label, code.baseExCents, code.taxCents]), [["GST", 10000, 1000], ["GST-free", 5000, 0]]);
  assert.equal(totals.totalCents, 16000);
});

test("rounding per line vs on the total", () => {
  // Three lines of $0.05 + GST: per line 0.5c rounds to 1c each (3c); on the total 1.5c rounds to 2c.
  const lines = [1, 2, 3].map(() => ({ qty: 1, unitCents: 5, taxCodeId: "gst" }));
  assert.equal(calculate(lines, taxExclusive).taxCents, 3);
  assert.equal(calculate(lines, { ...taxExclusive, rounding: "TOTAL" }).taxCents, 2);
});

test("fractional quantities don't drift", () => {
  const totals = calculate([{ qty: 0.1, unitCents: 3, taxCodeId: null }, { qty: 2.5, unitCents: 9850, taxCodeId: null }], taxExclusive);
  assert.equal(totals.lines[1]!.amountCents, 24625);
  assert.equal(totals.totalCents, 24625);
});

test("optional extras stay out of the total until chosen", () => {
  const lines: LineInput[] = [
    { qty: 1, unitCents: 10000, taxCodeId: "gst" },
    { qty: 6, unitCents: 9500, taxCodeId: "gst", optional: true },
  ];
  const totals = calculate(lines, taxExclusive);
  assert.equal(totals.totalCents, 11000);
  assert.equal(totals.optionsIncCents, 62700);
  lines[1] = { ...lines[1]!, chosen: true };
  assert.equal(calculate(lines, taxExclusive).totalCents, 11000 + 62700);
});

test("margin only when every line has a cost", () => {
  assert.equal(calculate([{ qty: 1, unitCents: 10000, unitCostCents: 6000, taxCodeId: "gst" }], taxExclusive).margin, 0.4);
  assert.equal(calculate([{ qty: 1, unitCents: 10000, taxCodeId: "gst" }], taxExclusive).margin, null);
});

test("formatting and parsing money", () => {
  assert.equal(formatMoney(123456), "$1,234.56");
  assert.equal(parseMoney("$1,250.5"), 125050);
  assert.equal(parseMoney("abc"), null);
  assert.equal(sellFromMarkup(10000, 25), 12500);
});

test("groupBySection keeps a section's lines together", () => {
  const groups = groupBySection([{ section: "Kitchen", n: 1 }, { section: null, n: 2 }, { section: "Bath", n: 3 }, { section: "Kitchen", n: 4 }]);
  assert.deepEqual(groups.map((group) => [group.section, group.items.map((item) => item.index)]), [["Other", [1]], ["Kitchen", [0, 3]], ["Bath", [2]]]);
  assert.deepEqual(groupBySection([{ section: null }, { section: " " }]).map((group) => group.section), [null]);
});

test("totalsFor adds chosen extras with their own tax rate", async () => {
  const { totalsFor } = await import("../snapshot.ts");
  const snapshot = {
    lines: [
      { section: null, description: "Board", qty: 1, unit: "each", unitCents: 100000, amountCents: 100000, taxLabel: "GST", taxRate: 0.1, optional: false },
      { section: null, description: "Smoke alarm", qty: 2, unit: "each", unitCents: 15000, amountCents: 30000, taxLabel: "GST", taxRate: 0.1, optional: true },
      { section: null, description: "Permit", qty: 1, unit: "each", unitCents: 5000, amountCents: 5000, taxLabel: "GST-free", optional: true },
    ],
    totals: { taxByCode: [{ label: "GST", rate: 0.1, taxCents: 10000 }] },
    tax: { pricesIncludeTax: false },
  } as unknown as Parameters<typeof totalsFor>[0];
  assert.equal(totalsFor(snapshot, []).totalCents, 110000);
  assert.equal(totalsFor(snapshot, [1]).totalCents, 143000);
  // A pre-3b snapshot without taxRate: GST-free isn't in taxByCode, so 0%.
  assert.equal(totalsFor(snapshot, [1, 2]).totalCents, 148000);
  assert.equal(totalsFor(snapshot, [1]).optionsIncCents, 5000);
});
