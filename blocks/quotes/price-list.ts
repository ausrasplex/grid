// Supplier price lists (docs/quotations-block.md "Supplier price lists"):
// reading a wholesaler's Excel or CSV file, and working out what it would
// change in the price book. No database here: the import screen uses the
// reading half in the browser, the server uses the planning half, and the
// tests use both.

/** What a price list's columns can hold. Code and cost are needed; the rest help. */
export const PRICE_LIST_FIELDS = ["code", "description", "cost", "per", "unit", "brand"] as const;
export type PriceListField = (typeof PRICE_LIST_FIELDS)[number];

export const FIELD_NAMES: Record<PriceListField, string> = {
  code: "Supplier code",
  description: "Description",
  cost: "Your price (ex GST)",
  per: "Price is per (quantity)",
  unit: "Unit",
  brand: "Brand",
};

/** Which column (0 = A) holds each field. */
export type ColumnMap = Partial<Record<PriceListField, number>>;
/** Saved per supplier: the heading of each field's column, so the columns can move next month. */
export type SavedColumns = Partial<Record<PriceListField, string>>;

/** One product on the list. `cost` is per one `unit` (already divided by "per"). */
export interface PriceListRow {
  code: string;
  description: string;
  cost: number;
  unit: string | null;
  brand: string | null;
}

export interface SkippedRow {
  /** The row number in the file, as the spreadsheet shows it (1 = first row). */
  line: number;
  reason: string;
}

const text = (value: unknown) => (value == null ? "" : String(value)).replace(/\s+/g, " ").trim();
const headingKey = (heading: string) => heading.toLowerCase().replace(/[^a-z0-9#%]+/g, " ").trim();

/** Supplier codes match ignoring case, spaces and dashes ("CLI-2025 WE" is "cli2025we"). */
export const codeKey = (code: string) => code.toLowerCase().replace(/[\s\-_./]+/g, "");
/** Suppliers match ignoring case and spacing ("Lawrence & Hanson" is "lawrence & hanson"). */
export const supplierKey = (supplier: string) => supplier.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Headings each field is usually under, best first. A wholesaler's own price
 * ("Nett", "Your price", "Trade") wins over list or retail price.
 */
const HEADING_PATTERNS: Record<PriceListField, RegExp[]> = {
  code: [
    /^(supplier |stock |item |part |product |cat |catalogue |catalog |order |article |material )?(code|no|number|#)$/,
    /^sku$/,
    /^(part|stock|item|product|cat|catalogue|catalog|order|article) ?(no|num|number|code|#)/,
    /\bcode\b/,
  ],
  description: [/^(item |product |long |short )?desc(ription)?$/, /^(product |item )?name$/, /desc/, /^details?$/],
  cost: [
    /^(nett?|your|trade|account|buy|cost|unit nett?|nett? unit) ?(price|cost)?( ex( gst)?)?$/,
    /^(price|cost)( ex( gst)?)?$/,
    /\b(nett?|your|trade|account)\b.*\bprice\b/,
    /\bex gst\b/,
    /\b(unit )?price\b(?!.*\b(list|rrp|retail|inc)\b)/,
  ],
  per: [/^(price )?per( qty| quantity)?$/, /^(pack|pkt|carton|box) ?(size|qty|quantity)$/, /^(qty|quantity) per$/, /^price unit$/],
  unit: [/^(uom|unit|units|unit of measure|unit of issue|sell unit|uoi)$/],
  brand: [/^(brand|manufacturer|make|mfr|mfg|vendor)( name)?$/, /\b(brand|manufacturer)\b/],
};

/**
 * Which column holds each field. Saved headings (from this supplier's last
 * import) come first; anything left is guessed from the headings. A column
 * is only used once.
 */
export function guessColumns(headings: string[], saved: SavedColumns = {}): ColumnMap {
  const keys = headings.map((heading) => headingKey(text(heading)));
  const map: ColumnMap = {};
  const used = new Set<number>();
  for (const field of PRICE_LIST_FIELDS) {
    const wanted = saved[field];
    if (!wanted) continue;
    const index = keys.indexOf(headingKey(wanted));
    if (index >= 0 && !used.has(index)) {
      map[field] = index;
      used.add(index);
    }
  }
  for (const field of PRICE_LIST_FIELDS) {
    if (map[field] != null) continue;
    for (const pattern of HEADING_PATTERNS[field]) {
      const index = keys.findIndex((key, column) => key && !used.has(column) && pattern.test(key));
      if (index >= 0) {
        map[field] = index;
        used.add(index);
        break;
      }
    }
  }
  return map;
}

/** The headings to save for this supplier, from the columns picked. */
export function savedColumnsFor(headings: string[], map: ColumnMap): SavedColumns {
  const saved: SavedColumns = {};
  for (const field of PRICE_LIST_FIELDS) {
    const index = map[field];
    if (index != null && text(headings[index])) saved[field] = text(headings[index]);
  }
  return saved;
}

/**
 * The heading row: the first of the top 30 rows with at least two headings
 * Grid knows (wholesalers often put their name, the date and the account
 * number above the table). Otherwise the first row with anything in it.
 */
export function findHeadingRow(cells: unknown[][]): number {
  const top = cells.slice(0, 30);
  for (let row = 0; row < top.length; row++) {
    const guessed = guessColumns((top[row] ?? []).map(text));
    if (guessed.code != null && Object.keys(guessed).length >= 2) return row;
  }
  const firstFilled = top.findIndex((row) => (row ?? []).some((cell) => text(cell)));
  return Math.max(0, firstFilled);
}

/** "$1,234.50", "1234.5", "12.30 ea" → 1234.5 etc. "POA", "-" or blank → null. */
export function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const cleaned = text(value).replace(/[$,\s]|aud/gi, "");
  const match = /^(\d+(?:\.\d+)?)/.exec(cleaned);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
}

/** Wholesaler units in plain words ("EA" → "each", "MTR" → "m"). */
export function plainUnit(unit: string | null): string | null {
  const key = (unit ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return null;
  const words: Record<string, string> = {
    ea: "each",
    each: "each",
    e: "each",
    pce: "each",
    pc: "each",
    m: "m",
    mtr: "m",
    mtrs: "m",
    metre: "m",
    metres: "m",
    meter: "m",
    lm: "m",
    pk: "pack",
    pkt: "pack",
    pack: "pack",
    bx: "box",
    box: "box",
    ctn: "carton",
    carton: "carton",
    roll: "roll",
    rl: "roll",
    drum: "drum",
    dr: "drum",
    lgth: "length",
    len: "length",
    lth: "length",
    length: "length",
    pr: "pair",
    pair: "pair",
    set: "set",
    kit: "kit",
    kg: "kg",
    l: "L",
    ltr: "L",
    hr: "hr",
  };
  return words[key] ?? unit!.trim().toLowerCase().slice(0, 20);
}

/**
 * The products on the list, from the rows under the heading row. A row with
 * no code is skipped quietly when it's empty or a section heading (no price
 * either), and reported when it has a price. "Per" divides the price: cable
 * priced per 100 m becomes a price per metre.
 */
export function readPriceList(cells: unknown[][], headingRow: number, map: ColumnMap): { rows: PriceListRow[]; skipped: SkippedRow[] } {
  const rows: PriceListRow[] = [];
  const skipped: SkippedRow[] = [];
  if (map.code == null || map.cost == null) return { rows, skipped };
  const cell = (row: unknown[], field: PriceListField) => (map[field] == null ? "" : text(row[map[field]!]));
  for (let index = headingRow + 1; index < cells.length; index++) {
    const row = cells[index] ?? [];
    const line = index + 1;
    const code = cell(row, "code");
    const rawCost = map.cost == null ? null : row[map.cost];
    const price = parseMoney(rawCost);
    if (!code) {
      if (price != null && cell(row, "description")) skipped.push({ line, reason: "No supplier code" });
      continue;
    }
    if (price == null) {
      if (text(rawCost)) skipped.push({ line, reason: `No price (it says "${text(rawCost).slice(0, 20)}")` });
      else skipped.push({ line, reason: "No price" });
      continue;
    }
    let per = 1;
    if (map.per != null) {
      const perValue = parseMoney(row[map.per]);
      if (perValue && perValue > 0) per = perValue;
    }
    rows.push({
      code,
      description: cell(row, "description") || code,
      cost: Math.round((price / per) * 100) / 100,
      unit: plainUnit(cell(row, "unit") || null),
      brand: cell(row, "brand") || null,
    });
  }
  return { rows, skipped };
}

// ---------------------------------------------------------------------
// Planning: what the list would change in the price book
// ---------------------------------------------------------------------

/** What to do with sell prices when a cost changes. */
export type SellPrices = "KEEP_MARKUP" | "KEEP_SELL";

/** A price book item the plan looks at. */
export interface PlanItem {
  id: string;
  name: string;
  supplier: string | null;
  supplierCode: string | null;
  cost: number | null;
  sell: number;
}

export interface PlannedChange {
  itemId: string;
  name: string;
  code: string;
  costBefore: number | null;
  costAfter: number;
  sellBefore: number;
  sellAfter: number;
  /** The item had no supplier yet: it gets this one. */
  setsSupplier: boolean;
}

export interface PriceListPlan {
  changes: PlannedChange[];
  /** Items on the list whose cost is already right. */
  unchanged: number;
  /** Codes on the list that match the price book (by codeKey). Everything else on the list is new. */
  matchedCodes: string[];
  /** Codes on the list more than once with different prices: the first one is used. */
  duplicateCodes: string[];
  /** This supplier's items in the price book that aren't on the list (maybe discontinued). */
  notOnList: { id: string; name: string; code: string }[];
}

const cents = (amount: number) => Math.round(amount * 100) / 100;

/**
 * Matches the list to the price book by supplier code. An item matches when
 * its code is the same and its supplier is this one, or it has no supplier
 * (it then gets this one). Every matching item is updated (a price book can
 * have the same product twice). "Keep my markup" moves the sell price with
 * the cost, by the same proportion; an item without a cost keeps its sell price.
 */
export function planPriceList(supplier: string, rows: Pick<PriceListRow, "code" | "cost">[], items: PlanItem[], sellPrices: SellPrices): PriceListPlan {
  const thisSupplier = supplierKey(supplier);
  const listed = new Map<string, Pick<PriceListRow, "code" | "cost">>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    const key = codeKey(row.code);
    if (!key) continue;
    const first = listed.get(key);
    if (!first) listed.set(key, row);
    else if (first.cost !== row.cost) duplicates.add(first.code);
  }

  const changes: PlannedChange[] = [];
  const matched = new Set<string>();
  const notOnList: PriceListPlan["notOnList"] = [];
  let unchanged = 0;
  for (const item of items) {
    if (!item.supplierCode) continue;
    const ours = !item.supplier || supplierKey(item.supplier) === thisSupplier;
    if (!ours) continue;
    const key = codeKey(item.supplierCode);
    const row = listed.get(key);
    if (!row) {
      if (item.supplier) notOnList.push({ id: item.id, name: item.name, code: item.supplierCode });
      continue;
    }
    matched.add(key);
    const costAfter = cents(row.cost);
    const setsSupplier = !item.supplier;
    if (item.cost != null && cents(item.cost) === costAfter && !setsSupplier) {
      unchanged++;
      continue;
    }
    const sellAfter = sellPrices === "KEEP_MARKUP" && item.cost != null && item.cost > 0 ? cents((item.sell * costAfter) / item.cost) : item.sell;
    changes.push({ itemId: item.id, name: item.name, code: item.supplierCode, costBefore: item.cost, costAfter, sellBefore: item.sell, sellAfter, setsSupplier });
  }
  return { changes, unchanged, matchedCodes: [...matched], duplicateCodes: [...duplicates], notOnList };
}

/** The sell price for an item added from the list: cost plus the markup (none: at cost). */
export const sellWithMarkup = (cost: number, markupPercent: number | null) => cents(cost * (1 + (markupPercent ?? 0) / 100));
