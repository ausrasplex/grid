// Sticker layouts for asset tags (docs/assets-block.md §1). Label sheets
// are a handful of standard grids that every brand copies: Officeworks,
// J.Burrows and the rest print "compatible with Avery L7160" on the packet,
// so each layout is named by labels per sheet and size, with the Avery code.
// Anything else is a Custom layout typed off the packet. A label printer
// prints one label per page. Millimetres throughout. Plain data, tested.

export interface StickerLayout {
  id: string;
  label: string;
  hint: string;
  page: { width: number; height: number };
  columns: number;
  rows: number;
  /** One sticker. */
  width: number;
  height: number;
  /** The first sticker's top-left corner. */
  top: number;
  left: number;
  /** From one sticker's corner to the next. */
  pitchX: number;
  pitchY: number;
}

const A4 = { width: 210, height: 297 };

/** An A4 sheet: across and down, with the gaps worked out from the pitch. */
const sheet = (id: string, avery: string, columns: number, rows: number, width: number, height: number, top: number, left: number, pitchX: number, pitchY: number): StickerLayout => ({
  id,
  label: `${columns * rows} per sheet, ${width} × ${height} mm`,
  hint: `Same as Avery ${avery}`,
  page: A4,
  columns,
  rows,
  width,
  height,
  top,
  left,
  pitchX,
  pitchY,
});

export const STICKER_LAYOUTS: StickerLayout[] = [
  sheet("a4-8", "L7165 / J8165", 2, 4, 99.1, 67.7, 13.1, 4.65, 101.6, 67.7),
  sheet("a4-10", "L7173 / J8173", 2, 5, 99.1, 57, 6, 4.65, 101.6, 57),
  sheet("a4-14", "L7163 / J8163", 2, 7, 99.1, 38.1, 15.15, 4.65, 101.6, 38.1),
  sheet("a4-16", "L7162 / J8162", 2, 8, 99.1, 33.9, 12.9, 4.65, 101.6, 33.9),
  sheet("a4-21", "L7160 / J8160", 3, 7, 63.5, 38.1, 15.15, 7.2, 66.04, 38.1),
  sheet("a4-24", "L7159 / J8159", 3, 8, 63.5, 33.9, 12.9, 7.2, 66.04, 33.9),
  sheet("a4-40", "L7654", 4, 10, 45.7, 25.4, 21.5, 9.7, 48.3, 25.4),
  sheet("a4-65", "L7651 / J8651", 5, 13, 38.1, 21.2, 10.7, 4.65, 40.64, 21.2),
  {
    id: "label-62x29",
    label: "Label printer, 62 × 29 mm",
    hint: "One label per page, like Brother DK-11209",
    page: { width: 62, height: 29 },
    columns: 1,
    rows: 1,
    width: 62,
    height: 29,
    top: 0,
    left: 0,
    pitchX: 62,
    pitchY: 29,
  },
];

export const DEFAULT_LAYOUT = "a4-21";

/** What's typed off the packet for a Custom layout. */
export interface CustomLayoutInput {
  /** "a4": a sheet of labels; "roll": a label printer, one label per page. */
  paper: "a4" | "roll";
  columns: number;
  rows: number;
  width: number;
  height: number;
  /** A4 only: the gap above the first row and left of the first column. */
  top: number;
  left: number;
  /** A4 only: the gaps between labels across and down. */
  gapX: number;
  gapY: number;
}

export function customLayout(input: CustomLayoutInput): StickerLayout {
  const roll = input.paper === "roll";
  const columns = roll ? 1 : input.columns;
  const rows = roll ? 1 : input.rows;
  return {
    id: "custom",
    label: roll ? `Custom label, ${input.width} × ${input.height} mm` : `Custom, ${columns * rows} per sheet, ${input.width} × ${input.height} mm`,
    hint: "Your own measurements",
    page: roll ? { width: input.width, height: input.height } : A4,
    columns,
    rows,
    width: input.width,
    height: input.height,
    top: roll ? 0 : input.top,
    left: roll ? 0 : input.left,
    pitchX: round(input.width + (roll ? 0 : input.gapX)),
    pitchY: round(input.height + (roll ? 0 : input.gapY)),
  };
}

/** Why a Custom layout won't fit on the page, or null when it does. */
export function layoutProblem(layout: StickerLayout): string | null {
  const right = layout.left + (layout.columns - 1) * layout.pitchX + layout.width;
  const bottom = layout.top + (layout.rows - 1) * layout.pitchY + layout.height;
  if (right > layout.page.width + 0.5) return `The labels run ${round(right - layout.page.width)} mm past the right edge of the page. Check the sizes and gaps.`;
  if (bottom > layout.page.height + 0.5) return `The labels run ${round(bottom - layout.page.height)} mm past the bottom of the page. Check the sizes and gaps.`;
  return null;
}

export const layoutById = (id: string, custom: StickerLayout | null = null) => (id === "custom" && custom ? custom : (STICKER_LAYOUTS.find((layout) => layout.id === id) ?? STICKER_LAYOUTS.find((layout) => layout.id === DEFAULT_LAYOUT)!));

export const perPage = (layout: StickerLayout) => layout.columns * layout.rows;

/** Small stickers show only the QR code, number and code (no logo or name). */
export const isCompact = (layout: StickerLayout) => layout.height < 25 || layout.width < 45;

/** The QR code's side: as tall as the sticker allows, never more than 40 mm or half its width. */
export const qrSide = (layout: StickerLayout) => round(Math.min(layout.height - (isCompact(layout) ? 3 : 5), layout.width * 0.5, 40));

export interface Placed<T> {
  page: number;
  x: number;
  y: number;
  item: T;
}

/**
 * Where each sticker goes: across then down, page after page. `start` skips
 * the spaces already used on a part-used first sheet (1 = the first space).
 * `offset` moves everything, for a printer that prints a little off.
 */
export function placeStickers<T>(layout: StickerLayout, items: T[], start = 1, offset = { x: 0, y: 0 }): Placed<T>[] {
  const size = perPage(layout);
  const skip = Math.min(Math.max(start, 1), size) - 1;
  return items.map((item, index) => {
    const slot = index + skip;
    const page = Math.floor(slot / size);
    const within = slot % size;
    const column = within % layout.columns;
    const row = Math.floor(within / layout.columns);
    return { page, x: round(layout.left + column * layout.pitchX + offset.x), y: round(layout.top + row * layout.pitchY + offset.y), item };
  });
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
