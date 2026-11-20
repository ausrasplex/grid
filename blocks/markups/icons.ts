// The trade icon library (phase 4c, docs/roadmap.md "Phase 4c"): simple,
// original line symbols for placing on plans and counting for take-offs.
// Every icon is drawn in a 24 × 24 box: an outline (circle, square,
// triangle, diamond, hexagon or none), an optional inner path, and an
// optional short label ("WP", "T"). Keys never change once used
// ("electrical.gpo-double"): placed icons and job numbers refer to them.
// Shared by the phone and the server, so no server code here.

export type IconOutline = "circle" | "square" | "triangle" | "diamond" | "hexagon" | "none";

export interface TradeIcon {
  key: string;
  name: string;
  /** Other words people use ("power point" finds GPO). */
  words: string[];
  outline: IconOutline;
  /** SVG path data in the 24 × 24 box, drawn as a line. */
  path?: string;
  /** Paths drawn filled. */
  fill?: string;
  /** A short label in the middle (two or three letters). */
  label?: string;
  /** An uploaded SVG (made safe) drawn instead of the parts above. */
  svg?: string;
  /** Draw the SVG in the trade's colour. */
  tint?: boolean;
}

export interface Trade {
  id: string;
  name: string;
  /** The trade's ink on the plan. */
  colour: string;
  icons: TradeIcon[];
}

const icon = (trade: string, slug: string, name: string, outline: IconOutline, draw: { path?: string; fill?: string; label?: string } = {}, words: string[] = []): TradeIcon => ({
  key: `${trade}.${slug}`,
  name,
  words,
  outline,
  ...draw,
});

export const TRADES: Trade[] = [
  {
    id: "electrical",
    name: "Electrical",
    colour: "#dc2626",
    icons: [
      icon("electrical", "gpo-single", "Single GPO", "circle", { path: "M12 4v16" }, ["power point", "outlet", "socket", "spo"]),
      icon("electrical", "gpo-double", "Double GPO", "circle", { path: "M9 4v16M15 4v16" }, ["power point", "outlet", "socket", "dgpo", "double power point"]),
      icon("electrical", "gpo-weatherproof", "Weatherproof GPO", "circle", { label: "WP" }, ["outdoor", "ip56", "power point", "outlet"]),
      icon("electrical", "gpo-usb", "GPO with USB", "circle", { path: "M8 5v14M16 5v14", label: "U" }, ["usb", "charger", "power point"]),
      icon("electrical", "gpo-15a", "15 A outlet", "circle", { label: "15" }, ["15 amp", "large earth", "outlet"]),
      icon("electrical", "outlet-3phase", "3-phase outlet", "circle", { label: "3Φ" }, ["three phase", "400v", "outlet", "415"]),
      icon("electrical", "isolator", "Isolator", "square", { path: "M6 17l12-10" }, ["isolating switch", "rotary", "ac isolator"]),
      icon("electrical", "switch-1", "Light switch", "none", { path: "M5 19l7-14 7 14", label: "" }, ["switch", "one gang", "1g"]),
      icon("electrical", "switch-2", "2-gang switch", "none", { path: "M3 19l5-14 5 14M11 19l5-14 5 14" }, ["switch", "two gang", "2g"]),
      icon("electrical", "switch-dimmer", "Dimmer", "circle", { label: "D" }, ["dimmer switch", "rotary dimmer"]),
      icon("electrical", "downlight", "Downlight", "circle", { path: "M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7" }, ["light", "led downlight", "can light"]),
      icon("electrical", "oyster", "Oyster light", "circle", { fill: "M12 7a5 5 0 1 0 0.01 0z" }, ["light", "ceiling light", "batten holder"]),
      icon("electrical", "batten", "Batten light", "none", { path: "M2 9h20v6H2zM2 12h20" }, ["fluoro", "led batten", "tube"]),
      icon("electrical", "pendant", "Pendant", "circle", { path: "M12 3v6M7 15h10" }, ["hanging light", "pendant light"]),
      icon("electrical", "wall-light", "Wall light", "none", { path: "M4 4v16M4 6a10 6 0 0 1 0 12" }, ["sconce", "light"]),
      icon("electrical", "exit-light", "Exit light", "square", { label: "EX" }, ["exit sign", "emergency"]),
      icon("electrical", "emergency-light", "Emergency light", "circle", { path: "M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7", label: "" , fill: "M12 9.5a2.5 2.5 0 1 0 0.01 0z" }, ["em light", "emergency"]),
      icon("electrical", "sensor", "Motion sensor", "circle", { path: "M8 10a5 5 0 0 1 8 0M6 7a8 8 0 0 1 12 0", label: "" }, ["pir", "occupancy", "sensor light"]),
      icon("electrical", "fan", "Ceiling fan", "circle", { path: "M12 12l0-7M12 12l6 4M12 12l-6 4" }, ["fan"]),
      icon("electrical", "exhaust-fan", "Exhaust fan", "square", { path: "M12 12l0-7M12 12l6 4M12 12l-6 4" }, ["extraction", "bathroom fan"]),
      icon("electrical", "switchboard", "Switchboard", "none", { path: "M3 5h18v14H3z", fill: "M3 5h18v7H3z" }, ["db", "distribution board", "msb", "sub board"]),
      icon("electrical", "meter", "Meter", "square", { label: "M" }, ["electricity meter", "kwh"]),
      icon("electrical", "ev-charger", "EV charger", "square", { label: "EV" }, ["car charger", "electric vehicle"]),
      icon("electrical", "cooktop", "Cooktop", "square", { path: "M8 8h.01M16 8h.01M8 16h.01M16 16h.01", label: "" }, ["stove", "hotplate", "induction"]),
      icon("electrical", "oven", "Oven", "square", { label: "OV" }, ["wall oven"]),
      icon("electrical", "junction-box", "Junction box", "square", { label: "JB" }, ["jb", "junction"]),
    ],
  },
  {
    id: "data",
    name: "Data & comms",
    colour: "#2563eb",
    icons: [
      icon("data", "data-1", "Data point", "triangle", { label: "1" }, ["network", "rj45", "cat6", "lan"]),
      icon("data", "data-2", "Double data point", "triangle", { label: "2" }, ["network", "rj45", "cat6", "lan"]),
      icon("data", "tv", "TV point", "square", { label: "TV" }, ["antenna", "coax", "f type"]),
      icon("data", "phone", "Phone point", "triangle", { label: "T" }, ["telephone", "voice"]),
      icon("data", "wifi", "Wi-Fi access point", "circle", { path: "M7 13a7 7 0 0 1 10 0M9.5 15.5a3.5 3.5 0 0 1 5 0", fill: "M12 17.5a1 1 0 1 0 0.01 0z" }, ["wap", "wireless", "ap"]),
      icon("data", "rack", "Comms rack", "none", { path: "M5 3h14v18H5zM5 8h14M5 13h14M5 18h14" }, ["cabinet", "patch panel", "server"]),
      icon("data", "nbn", "NBN connection", "hexagon", { label: "NBN" }, ["ntd", "fibre", "internet"]),
      icon("data", "speaker", "Speaker", "circle", { path: "M8 10h3l4-3v10l-4-3H8z" }, ["audio", "ceiling speaker"]),
      icon("data", "intercom", "Intercom", "square", { label: "IC" }, ["door station", "video intercom"]),
    ],
  },
  {
    id: "plumbing",
    name: "Plumbing",
    colour: "#16a34a",
    icons: [
      icon("plumbing", "tap-cold", "Cold tap", "circle", { label: "C" }, ["water", "faucet", "cold water"]),
      icon("plumbing", "tap-hot", "Hot tap", "circle", { label: "H" }, ["water", "faucet", "hot water"]),
      icon("plumbing", "mixer", "Mixer", "circle", { label: "M" }, ["tap", "flick mixer"]),
      icon("plumbing", "floor-waste", "Floor waste", "circle", { path: "M8 9h8M7 12h10M8 15h8" }, ["fw", "drain"]),
      icon("plumbing", "basin", "Basin", "none", { path: "M4 7h16v4a8 6 0 0 1-16 0z" }, ["vanity", "hand basin", "sink"]),
      icon("plumbing", "sink", "Sink", "none", { path: "M3 6h18v12H3zM6 9h12v6H6z" }, ["kitchen sink", "laundry tub"]),
      icon("plumbing", "toilet", "Toilet", "none", { path: "M8 3h8v5H8zM7 8h10a5 6 0 0 1-10 0" }, ["wc", "pan"]),
      icon("plumbing", "shower", "Shower", "square", { path: "M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7" }, ["shower base", "rose"]),
      icon("plumbing", "hot-water", "Hot water unit", "circle", { label: "HW" }, ["hwu", "heater", "storage", "heat pump"]),
      icon("plumbing", "gully", "Overflow gully", "square", { label: "OG" }, ["ORG", "relief gully"]),
      icon("plumbing", "valve", "Isolation valve", "none", { path: "M4 7l16 10V7L4 17z" }, ["stop valve", "ball valve"]),
    ],
  },
  {
    id: "hvac",
    name: "HVAC",
    colour: "#c026d3",
    icons: [
      icon("hvac", "supply", "Supply diffuser", "square", { path: "M4 4l16 16M20 4L4 20" }, ["air", "diffuser", "outlet", "ceiling diffuser"]),
      icon("hvac", "return", "Return grille", "square", { path: "M4 8h16M4 12h16M4 16h16" }, ["air", "return air", "grille"]),
      icon("hvac", "exhaust", "Exhaust grille", "square", { path: "M4 4l16 16" }, ["extraction", "exhaust air"]),
      icon("hvac", "split-head", "Split system (indoor)", "none", { path: "M2 8h20v8H2zM5 13h14" }, ["split", "wall mount", "indoor unit", "head"]),
      icon("hvac", "outdoor-unit", "Outdoor unit", "square", { path: "M12 12l0-6M12 12l5 3M12 12l-5 3" }, ["condenser", "odu", "compressor"]),
      icon("hvac", "thermostat", "Thermostat", "circle", { label: "T" }, ["controller", "zone control"]),
      icon("hvac", "temp-sensor", "Temperature sensor", "circle", { label: "TS" }, ["sensor", "room sensor"]),
      icon("hvac", "damper", "Damper", "circle", { path: "M5 19L19 5" }, ["zone damper", "motorised damper"]),
      icon("hvac", "fcu", "Fan coil unit", "square", { label: "FCU" }, ["fan coil"]),
      icon("hvac", "ahu", "Air handling unit", "square", { label: "AHU" }, ["air handler"]),
    ],
  },
  {
    id: "fire",
    name: "Fire",
    colour: "#ea580c",
    icons: [
      icon("fire", "smoke", "Smoke alarm", "circle", { label: "S" }, ["smoke detector", "smoke alarm", "240v smoke"]),
      icon("fire", "heat", "Heat detector", "circle", { label: "H" }, ["thermal", "detector"]),
      icon("fire", "mcp", "Manual call point", "square", { label: "MCP" }, ["break glass", "call point"]),
      icon("fire", "sprinkler", "Sprinkler head", "circle", { path: "M12 4v16M4 12h16" }, ["sprinkler"]),
      icon("fire", "extinguisher", "Extinguisher", "triangle", { label: "E" }, ["fire extinguisher"]),
      icon("fire", "hose-reel", "Hose reel", "circle", { label: "HR" }, ["fire hose"]),
      icon("fire", "blanket", "Fire blanket", "square", { label: "FB" }, ["blanket"]),
      icon("fire", "panel", "Fire panel", "square", { label: "FIP" }, ["fip", "indicator panel"]),
      icon("fire", "sounder", "Sounder / strobe", "circle", { path: "M8 9h3l4-3v12l-4-3H8z" }, ["bell", "ewis", "strobe", "sounder"]),
    ],
  },
  {
    id: "security",
    name: "Security",
    colour: "#334155",
    icons: [
      icon("security", "pir", "PIR detector", "triangle", { label: "P" }, ["motion", "detector"]),
      icon("security", "reed", "Reed switch", "square", { label: "R" }, ["door contact", "magnetic", "reed"]),
      icon("security", "keypad", "Keypad", "square", { path: "M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" }, ["alarm keypad", "code pad"]),
      icon("security", "camera", "CCTV camera", "none", { path: "M3 8h12v8H3zM15 10l6-3v10l-6-3" }, ["cctv", "camera", "ip camera"]),
      icon("security", "card-reader", "Card reader", "square", { label: "CR" }, ["access control", "prox", "fob"]),
      icon("security", "siren", "Siren", "circle", { path: "M8 9h3l4-3v12l-4-3H8z" }, ["alarm", "strobe"]),
      icon("security", "lock", "Electric lock", "square", { label: "EL" }, ["strike", "maglock"]),
    ],
  },
  {
    id: "gas",
    name: "Gas",
    colour: "#ca8a04",
    icons: [
      icon("gas", "bayonet", "Gas bayonet", "circle", { label: "G" }, ["gas point", "bayonet fitting"]),
      icon("gas", "meter", "Gas meter", "square", { label: "GM" }, ["meter"]),
      icon("gas", "cooktop", "Gas cooktop", "square", { label: "GC" }, ["hotplate", "stove"]),
      icon("gas", "heater", "Gas heater", "square", { label: "GH" }, ["space heater", "wall furnace"]),
      icon("gas", "valve", "Gas valve", "none", { path: "M4 7l16 10V7L4 17z" }, ["isolation", "ball valve"]),
      icon("gas", "regulator", "Regulator", "diamond", { label: "R" }, ["reg", "pressure"]),
    ],
  },
  {
    id: "solar",
    name: "Solar & batteries",
    colour: "#0891b2",
    icons: [
      icon("solar", "panel", "Solar panel", "none", { path: "M3 6h18v12H3zM9 6v12M15 6v12M3 12h18" }, ["pv", "module"]),
      icon("solar", "inverter", "Inverter", "square", { path: "M6 14c2-4 4-4 6 0s4 4 6 0" }, ["grid inverter", "hybrid"]),
      icon("solar", "battery", "Battery", "none", { path: "M4 7h14v10H4zM18 10h2v4h-2M7 12h3M13 12h3M14.5 10.5v3" }, ["storage", "home battery"]),
      icon("solar", "dc-isolator", "DC isolator", "square", { path: "M6 17l12-10", label: "" }, ["isolator", "rooftop isolator"]),
      icon("solar", "optimiser", "Optimiser", "diamond", { label: "O" }, ["micro inverter", "optimizer"]),
    ],
  },
];

const BY_KEY = new Map(TRADES.flatMap((trade) => trade.icons.map((entry) => [entry.key, { icon: entry, trade }] as const)));

export const iconByKey = (key: string) => BY_KEY.get(key)?.icon ?? null;
export const tradeOf = (key: string) => BY_KEY.get(key)?.trade ?? null;
export const isIconKey = (key: string) => BY_KEY.has(key);

/** "DGPO 2 Iconic" style name for an icon with its job number. */
export function iconLabel(key: string, number: number | null, versionName?: string | null, numbered = true): string {
  const name = iconByKey(key)?.name ?? key;
  if (!numbered || number === null) return name;
  return `${name} ${number}${versionName ? ` (${versionName})` : ""}`;
}

/** Icons whose name, words or trade match every word typed. */
export function searchIcons(query: string): { trade: Trade; icons: TradeIcon[] }[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return TRADES.map((trade) => ({ trade, icons: trade.icons }));
  return TRADES.map((trade) => ({
    trade,
    icons: trade.icons.filter((entry) => {
      const text = [entry.name, ...entry.words, trade.name, entry.label ?? ""].join(" ").toLowerCase();
      return words.every((word) => text.includes(word));
    }),
  })).filter((group) => group.icons.length > 0);
}

// ---------------------------------------------------------------------
// Custom icons (phase 4c part 3): a business's own symbols, built from the
// same parts (an outline, a short label) so they read like the rest and stay
// sharp at any zoom. Their keys are "custom.<id>"; the rows are CustomIcon.
// ---------------------------------------------------------------------

export const ICON_OUTLINES: IconOutline[] = ["circle", "square", "triangle", "diamond", "hexagon"];
export const OUTLINE_NAMES: Record<IconOutline, string> = { circle: "Circle", square: "Square", triangle: "Triangle", diamond: "Diamond", hexagon: "Hexagon", none: "None" };

/** The group custom icons with no trade go in. */
export const CUSTOM_TRADE: Trade = { id: "custom", name: "Custom", colour: "#7c3aed", icons: [] };

export interface CustomIconRow {
  id: string;
  /** A built-in trade's id, or "custom". */
  trade: string;
  name: string;
  words: string[];
  outline: string;
  label: string;
  /** An uploaded SVG, already made safe. */
  svg: string | null;
  tint: boolean;
  /** Replaces this built-in icon's look for the business. */
  replacesKey: string | null;
  /** Removed from the library; ones already placed still draw. */
  deleted: boolean;
}

export const customKey = (id: string) => `custom.${id}`;
export const isCustomKey = (key: string) => /^custom\.[0-9a-f-]{36}$/.test(key);

export function customIcon(row: CustomIconRow): TradeIcon {
  const look: TradeIcon = { key: customKey(row.id), name: row.name, words: row.words, outline: (ICON_OUTLINES as string[]).includes(row.outline) ? (row.outline as IconOutline) : "circle", label: row.label };
  return row.svg ? { ...look, outline: "none", label: undefined, svg: row.svg, tint: row.tint } : look;
}

/** A built-in icon with the business's replacement look (its key, words and trade stay). */
export function replacedIcon(builtIn: TradeIcon, row: CustomIconRow): TradeIcon {
  const look = customIcon(row);
  return { ...builtIn, name: row.name || builtIn.name, outline: look.outline, label: look.label, svg: look.svg, tint: look.tint, path: undefined, fill: undefined };
}

// ---------------------------------------------------------------------
// Group colours: a business can give an icon group (a trade, or Custom) its
// own colour (IconGroupColour). Icons in the group draw in it everywhere.
// ---------------------------------------------------------------------

/** Trade id → "#rrggbb", only for groups the business has changed. */
export type GroupColours = Record<string, string>;

export const isHexColour = (colour: string) => /^#[0-9a-f]{6}$/i.test(colour);

/** Colours that read well on a white plan, offered first when picking. */
export const GROUP_PALETTE = [
  "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#0891b2", "#2563eb",
  "#4f46e5", "#7c3aed", "#c026d3", "#db2777", "#92400e", "#334155", "#111827",
];

/** How well a colour stands out on white paper (WCAG contrast ratio, 1 to 21). */
export function contrastOnWhite(colour: string): number {
  const channel = (start: number) => {
    const value = parseInt(colour.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return 1.05 / (luminance + 0.05);
}

/** Every icon group (Custom first, then the trades) in the business's colours. */
export function iconGroups(colours: GroupColours = {}): Trade[] {
  return [CUSTOM_TRADE, ...TRADES].map((trade) => paintTrade(trade, colours));
}

const paintTrade = (trade: Trade, colours: GroupColours): Trade => {
  const colour = colours[trade.id];
  return colour && isHexColour(colour) && colour.toLowerCase() !== trade.colour ? { ...trade, colour } : trade;
};

/** Looks up built-in and this business's custom icons together, in its group colours. */
export function iconLookup(customs: CustomIconRow[], colours: GroupColours = {}) {
  const own = customs.filter((row) => !row.replacesKey);
  const byKey = new Map(own.map((row) => [customKey(row.id), row]));
  // Built-in icons the business has given its own look.
  const replaced = new Map(customs.filter((row) => row.replacesKey && !row.deleted).map((row) => [row.replacesKey!, row]));
  const builtIn = (entry: TradeIcon) => {
    const row = replaced.get(entry.key);
    return row ? replacedIcon(entry, row) : entry;
  };
  const groups = iconGroups(colours);
  const custom = groups[0]!;
  const tradeById = new Map(groups.slice(1).map((trade) => [trade.id, trade]));
  return {
    /** Every group in the business's colours: Custom first, then the trades. */
    groups,
    icon: (key: string): TradeIcon | null => {
      const row = byKey.get(key);
      if (row) return customIcon(row);
      const entry = iconByKey(key);
      return entry ? builtIn(entry) : null;
    },
    trade: (key: string): Trade | null => {
      const row = byKey.get(key);
      if (row) return tradeById.get(row.trade) ?? custom;
      const trade = tradeOf(key);
      return trade ? tradeById.get(trade.id)! : null;
    },
    label: (key: string, number: number | null, versionName?: string | null, numbered = true) => {
      const row = byKey.get(key);
      const name = row?.name ?? replaced.get(key)?.name ?? iconByKey(key)?.name ?? "Icon";
      if (!numbered || number === null) return name;
      return `${name} ${number}${versionName ? ` (${versionName})` : ""}`;
    },
    /** Library groups: custom icons join their trade's group (or Custom, first), then searched like the rest. */
    search: (query: string): { trade: Trade; icons: TradeIcon[] }[] => {
      const live = own.filter((row) => !row.deleted);
      const library = [
        { ...custom, icons: live.filter((row) => !tradeById.has(row.trade)).map(customIcon) },
        ...groups.slice(1).map((trade) => ({ ...trade, icons: [...live.filter((row) => row.trade === trade.id).map(customIcon), ...trade.icons.map(builtIn)] })),
      ];
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      return library
        .map((trade) => ({
          trade,
          icons: words.length ? trade.icons.filter((entry) => words.every((word) => [entry.name, ...entry.words, trade.name, entry.label ?? ""].join(" ").toLowerCase().includes(word))) : trade.icons,
        }))
        .filter((group) => group.icons.length > 0);
    },
  };
}
export type IconLookup = ReturnType<typeof iconLookup>;
