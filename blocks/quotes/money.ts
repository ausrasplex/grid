// Quote maths (no imports, so it's unit-tested directly and runs the same
// in the browser for live totals). Money is whole cents; quantities can
// have up to 3 decimal places. Nothing here knows about GST: tax names and
// rates come from the company's settings (docs/quotations-block.md §3a).

export interface TaxRate {
  id: string;
  label: string;
  /** 0.1 for 10% */
  rate: number;
}

export interface LineInput {
  qty: number;
  /** Price per unit in cents, as entered (incl. or excl. tax, per the quote). */
  unitCents: number;
  /** Cost per unit in cents, if known. */
  unitCostCents?: number | null;
  taxCodeId: string | null;
  /** Optional extra the customer can choose; not in the total unless chosen. */
  optional?: boolean;
  chosen?: boolean;
}

export interface Settings {
  pricesIncludeTax: boolean;
  /** "LINE": round tax on each line. "TOTAL": once per tax rate. */
  rounding: "LINE" | "TOTAL";
  codes: TaxRate[];
}

export interface LineResult {
  /** The line's price as entered (qty × unit), cents. */
  amountCents: number;
  exCents: number;
  taxCents: number;
  incCents: number;
  costCents: number | null;
  inTotal: boolean;
}

export interface Totals {
  lines: LineResult[];
  subtotalExCents: number;
  taxCents: number;
  totalCents: number;
  /** One row per rate used (for "GST (10%)" lines and the breakdown). */
  taxByCode: { id: string; label: string; rate: number; baseExCents: number; taxCents: number }[];
  costCents: number;
  /** (sell ex tax − cost) ÷ sell ex tax as a fraction (0.4 = 40%), only when every line has a cost. */
  margin: number | null;
  /** Optional extras not chosen, priced the same way. */
  optionsIncCents: number;
}

/** Quantities to 3 decimal places, so 0.1 × 3 doesn't drift. */
const milli = (quantity: number) => Math.round(quantity * 1000);
const lineAmount = (qty: number, unitCents: number) => Math.round((milli(qty) * unitCents) / 1000);

export function calculate(lines: LineInput[], settings: Settings): Totals {
  const rate = (id: string | null) => settings.codes.find((code) => code.id === id)?.rate ?? 0;
  const results: LineResult[] = lines.map((line) => {
    const amount = lineAmount(line.qty, line.unitCents);
    const taxRate = rate(line.taxCodeId);
    // Exact (unrounded) tax, rounded below as the settings say.
    const exExact = settings.pricesIncludeTax ? amount / (1 + taxRate) : amount;
    const taxExact = settings.pricesIncludeTax ? amount - exExact : amount * taxRate;
    const tax = Math.round(taxExact);
    const amountEx = settings.pricesIncludeTax ? amount - tax : amount;
    return {
      amountCents: amount,
      exCents: amountEx,
      taxCents: tax,
      incCents: amountEx + tax,
      costCents: line.unitCostCents == null ? null : lineAmount(line.qty, line.unitCostCents),
      inTotal: !line.optional || !!line.chosen,
    };
  });

  const byCode = new Map<string, { base: number; exact: number; rounded: number }>();
  lines.forEach((line, index) => {
    const result = results[index]!;
    if (!result.inTotal) return;
    const key = line.taxCodeId ?? "";
    const taxRate = rate(line.taxCodeId);
    const entry = byCode.get(key) ?? { base: 0, exact: 0, rounded: 0 };
    entry.base += settings.pricesIncludeTax ? result.amountCents : result.exCents;
    entry.exact += settings.pricesIncludeTax ? result.amountCents - result.amountCents / (1 + taxRate) : result.exCents * taxRate;
    entry.rounded += result.taxCents;
    byCode.set(key, entry);
  });

  const taxByCode = [...byCode.entries()].map(([id, entry]) => {
    const code = settings.codes.find((code) => code.id === id);
    const tax = settings.rounding === "TOTAL" ? Math.round(entry.exact) : entry.rounded;
    const baseEx = settings.pricesIncludeTax ? entry.base - tax : entry.base;
    return { id, label: code?.label ?? "No tax", rate: code?.rate ?? 0, baseExCents: baseEx, taxCents: tax };
  });

  const counted = results.filter((result) => result.inTotal);
  const taxCents = taxByCode.reduce((total, code) => total + code.taxCents, 0);
  const subtotalExCents = taxByCode.reduce((total, code) => total + code.baseExCents, 0);
  const allCosted = counted.length > 0 && counted.every((line) => line.costCents !== null);
  const costCents = counted.reduce((total, line) => total + (line.costCents ?? 0), 0);
  return {
    lines: results,
    subtotalExCents,
    taxCents,
    totalCents: subtotalExCents + taxCents,
    taxByCode,
    costCents,
    margin: allCosted && subtotalExCents > 0 ? (subtotalExCents - costCents) / subtotalExCents : null,
    optionsIncCents: results.filter((result) => !result.inTotal).reduce((total, result) => total + result.incCents, 0),
  };
}

/** "$1,234.56" in the company's currency and locale. */
export function formatMoney(cents: number, currency = "AUD", locale = "en-AU"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/** "12.50" → 1250. Accepts "$1,250", "1250.5"; returns null if it isn't a number. */
export function parseMoney(input: string): number | null {
  const clean = input.replace(/[^0-9.\-]/g, "");
  if (!clean || isNaN(Number(clean))) return null;
  return Math.round(Number(clean) * 100);
}

/** Sell price from cost and markup %: 100.00 at 25% → 125.00. */
export function sellFromMarkup(costCents: number, markupPct: number): number {
  return Math.round(costCents * (1 + markupPct / 100));
}

/**
 * Lines grouped by section, in the order each section first appears, so a
 * section's lines stay together however they were added. Lines without a
 * section come first (labelled "Other" only when there are sections too).
 * Each entry keeps the line's original index (for its calculated amount).
 */
export function groupBySection<T extends { section: string | null }>(lines: T[]): { section: string | null; items: { line: T; index: number }[] }[] {
  const groups = new Map<string, { section: string | null; items: { line: T; index: number }[] }>();
  groups.set("", { section: null, items: [] });
  lines.forEach((line, index) => {
    const sectionKey = line.section?.trim() || "";
    if (!groups.has(sectionKey)) groups.set(sectionKey, { section: sectionKey, items: [] });
    groups.get(sectionKey)!.items.push({ line, index });
  });
  const out = [...groups.values()].filter((value) => value.items.length);
  if (out.length > 1 && out[0]!.section === null) out[0]!.section = "Other";
  return out;
}
