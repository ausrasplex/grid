// The handover table's columns (docs/materials-block.md §3 "Columns belong
// to the trade"). Each trade has its own layout; for now every trade uses
// the product layout. Finish layouts (paint: Walls / Trims / Ceiling per
// room) are added here when a trade needs them. A business can hide the
// optional columns per trade (Settings › Handover).

export type ColumnKey = "item" | "image" | "product" | "finish" | "qty" | "link" | "notes";

export interface Column {
  key: ColumnKey;
  label: string;
  /** Share of the table's width (the PDF), in parts. */
  width: number;
  /** Can be hidden per trade in Settings › Handover. */
  optional?: boolean;
}

export const PRODUCT_LAYOUT: readonly Column[] = [
  { key: "item", label: "Item", width: 12 },
  { key: "image", label: "Image", width: 16 },
  { key: "product", label: "Product", width: 26 },
  { key: "finish", label: "Colour / finish / size", width: 18 },
  { key: "qty", label: "Qty", width: 6 },
  { key: "link", label: "Link", width: 7, optional: true },
  { key: "notes", label: "Notes", width: 15, optional: true },
];

/** Layouts that differ from the product layout, by trade id. None yet. */
const TRADE_LAYOUTS: Partial<Record<string, readonly Column[]>> = {};

export const layoutFor = (trade: string): readonly Column[] => TRADE_LAYOUTS[trade] ?? PRODUCT_LAYOUT;

/** The optional columns of a trade's layout, for the settings screen. */
export const optionalColumns = (trade: string) => layoutFor(trade).filter((column) => column.optional);

/**
 * The columns one trade's table prints: Qty only when the job shows
 * quantities, the business's hidden columns left out, and Notes left out
 * when no line has one.
 */
export function columnsFor(trade: string, options: { showQty: boolean; hidden: readonly string[]; anyNotes: boolean }): Column[] {
  return layoutFor(trade).filter((column) => {
    if (column.key === "qty") return options.showQty;
    if (column.optional && options.hidden.includes(column.key)) return false;
    if (column.key === "notes") return options.anyNotes;
    return true;
  });
}
