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
  let match = trimmed.match(/^level\s*(\d+)$/i);
  if (match) return `L${match[1]}`;
  match = trimmed.match(/^basement\s*(\d*)$/i);
  if (match) return `B${match[1]}`;
  if (/^ground(\s*floor)?$/i.test(trimmed)) return "G";
  if (/^lower\s*ground$/i.test(trimmed)) return "LG";
  if (/^upper\s*ground$/i.test(trimmed)) return "UG";
  if (/^mezzanine$/i.test(trimmed)) return "M";
  return trimmed.length <= 5 ? trimmed : trimmed.slice(0, 4);
}

/**
 * The usual set of floors, top first: Roof, Level N … Level 1, Ground,
 * then basements. Used by "Add levels" so a 7-storey building is one step.
 */
export function standardLevels(options: { above: number; basements: number; roof: boolean }): string[] {
  const out: string[] = [];
  if (options.roof) out.push("Roof");
  for (let index = options.above; index >= 1; index--) out.push(`Level ${index}`);
  out.push("Ground");
  for (let index = 1; index <= options.basements; index++) out.push(options.basements === 1 ? "Basement" : `Basement ${index}`);
  return out;
}
