// Address matching for sites. No imports, so it's unit-tested directly.

const STREET_TYPES: Record<string, string> = {
  street: "st", road: "rd", avenue: "ave", av: "ave", drive: "dr", court: "ct", place: "pl",
  crescent: "cres", cr: "cres", parade: "pde", highway: "hwy", lane: "ln", terrace: "tce",
  boulevard: "blvd", close: "cl", circuit: "cct", grove: "gr", square: "sq", way: "wy",
  esplanade: "esp", parkway: "pkwy",
};

const STATES: Record<string, string> = {
  victoria: "vic", "new south wales": "nsw", queensland: "qld", "south australia": "sa",
  "western australia": "wa", tasmania: "tas", "northern territory": "nt", "australian capital territory": "act",
};

/**
 * "12 Smith Street, Brunswick VIC 3056" and "12 smith st brunswick 3056 vic"
 * both become comparable. Unit numbers stay ("2/12 smith st").
 */
export function addressKey(address: string): string {
  let text = address.toLowerCase().replace(/\s+/g, " ").trim();
  for (const [long, short] of Object.entries(STATES)) text = text.replace(new RegExp(`\\b${long}\\b`, "g"), short);
  text = text.replace(/\bunit\s+(\w+)\s*,?\s*/g, "$1/");
  text = text.replace(/[.,;#]/g, " ").replace(/\s*\/\s*/g, "/");
  const words = text.split(" ").filter(Boolean).map((word) => STREET_TYPES[word] ?? word);
  return words.join(" ");
}

/** A short, readable site name from an address: "12 Smith St". */
export function siteNameFromAddress(address: string): string {
  const first = address.split(",")[0]!.trim();
  const words = first.split(/\s+/).map((word) => {
    const short = STREET_TYPES[word.toLowerCase()];
    return short ? short.charAt(0).toUpperCase() + short.slice(1) : word;
  });
  return words.join(" ").slice(0, 120) || address.slice(0, 120);
}

/** "Level 5" → "L5", "Ground" → "G", "Basement 2" → "B2", "Roof" → "Roof". */
export function levelShortName(name: string): string {
  const trimmed = name.trim();
  // "Level 40", and "Level 40 Plant room" / "Level 40 - Plant room" too.
  let match = trimmed.match(/^level\s*(\d+)(?:\b|$)/i);
  if (match) return `L${match[1]}`;
  match = trimmed.match(/^basement\s*(\d+)\b/i);
  if (match) return `B${match[1]}`;
  match = trimmed.match(/^basement\s*(\d*)$/i);
  if (match) return `B${match[1]}`;
  // Car parks below ground: "Parking 2", "Car park 2", "Carpark level 2", "P2" → P2.
  match = trimmed.match(/^(?:parking|car\s*park)(?:\s*level)?\s*(\d*)$/i) ?? trimmed.match(/^p(\d+)$/i);
  if (match) return `P${match[1]}`;
  if (/^ground(\s*floor)?$/i.test(trimmed)) return "G";
  if (/^lower\s*ground$/i.test(trimmed)) return "LG";
  if (/^upper\s*ground$/i.test(trimmed)) return "UG";
  if (/^mezzanine$/i.test(trimmed)) return "M";
  return trimmed.length <= 5 ? trimmed : trimmed.slice(0, 4);
}

/** Uses offered for a floor (any words are fine). */
export const LEVEL_USES = ["Plant room", "Car park", "Retail", "Office", "Residential", "Mezzanine", "Podium", "Lobby", "Amenities", "Services", "Storage", "Roof terrace"];

/** A floor as people read it: "Level 40 · Plant room", or just "Level 40". */
export function levelLabel(level: { name: string; use?: string | null }): string {
  return level.use ? `${level.name} · ${level.use}` : level.name;
}

/** What the floors below ground are: basements (B1, B2…) or car parking (P1, P2…). */
export type BelowGround = "basement" | "parking";

/**
 * The usual set of floors, top first: Roof, Level N … Level 1, Ground,
 * then the floors below ground, as basements ("Basement", "Basement 2")
 * or parking ("Parking 1", "Parking 2": P1, P2 like the lift buttons).
 * Used by "Add levels" so a 7-storey building is one step.
 */
export function standardLevels(options: { above: number; basements: number; roof: boolean; below?: BelowGround }): string[] {
  const out: string[] = [];
  if (options.roof) out.push("Roof");
  for (let index = options.above; index >= 1; index--) out.push(`Level ${index}`);
  out.push("Ground");
  for (let index = 1; index <= options.basements; index++) {
    if (options.below === "parking") out.push(`Parking ${index}`);
    else out.push(options.basements === 1 ? "Basement" : `Basement ${index}`);
  }
  return out;
}

/** The parking name for a basement ("Basement 2" → "Parking 2", "Basement" → "Parking 1"), or null if it isn't one. */
export function basementAsParking(name: string): string | null {
  const match = name.trim().match(/^basement\s*(\d*)$/i);
  return match ? `Parking ${match[1] || "1"}` : null;
}

/** How level names are compared: case and extra spaces don't make two levels different ("Level 3" = "level  3"). */
export function levelKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Names in `adding` that a building can't take: already one of `existing`,
 * or given twice in `adding`. Each name is listed once, as typed.
 */
export function levelNameClashes(existing: string[], adding: string[]): string[] {
  const taken = new Set(existing.map(levelKey));
  const seen = new Set<string>();
  const clashes: string[] = [];
  for (const name of adding) {
    const key = levelKey(name);
    if ((taken.has(key) || seen.has(key)) && !clashes.some((clash) => levelKey(clash) === key)) clashes.push(name.trim());
    seen.add(key);
  }
  return clashes;
}

/**
 * A short name (crumbs, chips) no other level in the building uses:
 * `base`, or `base` with 2, 3… on the end ("Carp", "Carp2"), at most 8 letters.
 */
export function uniqueShortName(base: string, taken: string[]): string {
  const used = new Set(taken.map((short) => short.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let number = 2; ; number++) {
    const suffix = String(number);
    const candidate = base.slice(0, 8 - suffix.length) + suffix;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
