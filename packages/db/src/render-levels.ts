// How sharp Grid draws PDFs for the in-app viewers: a level per kind, set
// by the server admin in Settings › Plans & PDFs (and per plan sheet).
// Higher levels zoom sharper but take longer to render and more disk; the
// size limits stop a huge sheet from running the server out of memory.
// No imports, so the settings screen and the tests use it as is.

export const PLAN_LEVELS = ["LOW", "MEDIUM", "HIGH", "EXTREME"] as const;
export type PlanLevel = (typeof PLAN_LEVELS)[number];
/** Documents and quote PDFs: no Extreme, because each page is one picture the phone holds whole. */
export const PAGE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type PageLevel = (typeof PAGE_LEVELS)[number];

export const LEVEL_NAMES: Record<PlanLevel, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", EXTREME: "Extreme" };

/** Plans: dots per inch, and the biggest picture (megapixels) a sheet is drawn at. Tiles mean the phone only loads what's on screen. */
export const PLAN_LEVEL_SIZES: Record<PlanLevel, { dpi: number; maxMegapixels: number }> = {
  LOW: { dpi: 200, maxMegapixels: 32 },
  MEDIUM: { dpi: 250, maxMegapixels: 48 },
  HIGH: { dpi: 300, maxMegapixels: 72 },
  EXTREME: { dpi: 500, maxMegapixels: 200 },
};

/** Documents and quote PDFs: dots per inch, and the longest side of a page picture in pixels (what a phone handles comfortably). */
export const PAGE_LEVEL_SIZES: Record<PageLevel, { dpi: number; maxEdge: number }> = {
  LOW: { dpi: 150, maxEdge: 2000 },
  MEDIUM: { dpi: 200, maxEdge: 2600 },
  HIGH: { dpi: 250, maxEdge: 3300 },
};

/** Rough disk per A1 plan sheet, and per A4 page, shown beside each level. */
export const PLAN_LEVEL_DISK: Record<PlanLevel, string> = { LOW: "about 4–6 MB per A1 sheet", MEDIUM: "about 6–10 MB per A1 sheet", HIGH: "about 9–14 MB per A1 sheet", EXTREME: "about 25–45 MB per A1 sheet, and up to 1 GB of memory while drawing" };
export const PAGE_LEVEL_DISK: Record<PageLevel, string> = { LOW: "about 0.2–0.4 MB per A4 page", MEDIUM: "about 0.3–0.6 MB per A4 page", HIGH: "about 0.5–1 MB per A4 page" };

const LOWEST_DPI = 72;

/** The dpi to draw a plan page at: the level's, or less when the sheet is so big it would pass the level's size limit. */
export function planDpi(level: PlanLevel, page: { widthPt: number; heightPt: number }): number {
  const { dpi, maxMegapixels } = PLAN_LEVEL_SIZES[level];
  const squareInches = (page.widthPt / 72) * (page.heightPt / 72);
  if (!squareInches) return Math.min(dpi, 150);
  return Math.max(LOWEST_DPI, Math.min(dpi, Math.floor(Math.sqrt((maxMegapixels * 1_000_000) / squareInches))));
}

/** The dpi to draw a document or quote at, from its biggest page's longest side (inches): the level's, or less for big pages. */
export function pageDpi(level: PageLevel, longestSideInches: number): number {
  const { dpi, maxEdge } = PAGE_LEVEL_SIZES[level];
  if (!longestSideInches) return dpi;
  return Math.max(LOWEST_DPI, Math.min(dpi, Math.floor(maxEdge / longestSideInches)));
}

export const isPlanLevel = (value: unknown): value is PlanLevel => (PLAN_LEVELS as readonly unknown[]).includes(value);
export const isPageLevel = (value: unknown): value is PageLevel => (PAGE_LEVELS as readonly unknown[]).includes(value);
