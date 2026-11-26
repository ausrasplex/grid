// Themes people make themselves (Settings › Themes, docs/visual-style.md
// "Your own themes"). Plain functions with no React, so the server (to put
// the colours on <html>), the editor (live preview) and the tests share them.
//
// A theme is saved as:
//   look         "grid" or "soft": the shapes and font (data-look on <html>)
//   keyColours   the few colours picked in the simple editor (page, cards…)
//   overrides    any single colour set by hand under Advanced
// and every one of Grid's colour tokens is worked out from those.

import type { Look } from "./themes";

/** The colours picked in the simple editor. */
export interface KeyColours {
  page: string;
  card: string;
  text: string;
  main: string;
  /** Soft look only: Home's big card, and its three tiles. */
  hero: string;
  tile1: string;
  tile2: string;
  tile3: string;
}

export type KeyColourName = keyof KeyColours;

export const KEY_COLOURS: { name: KeyColourName; label: string; hint: string; softOnly?: boolean }[] = [
  { name: "page", label: "Page", hint: "Behind everything, and the menus" },
  { name: "card", label: "Cards", hint: "Cards, sheets, the phone bar and boxes" },
  { name: "text", label: "Text", hint: "The main writing" },
  { name: "main", label: "Main colour", hint: "Buttons, the current menu item, links and badges" },
  { name: "hero", label: "Home card", hint: "The big card at the top of Home", softOnly: true },
  { name: "tile1", label: "Tile 1", hint: "First tile on Home", softOnly: true },
  { name: "tile2", label: "Tile 2", hint: "Second tile on Home", softOnly: true },
  { name: "tile3", label: "Tile 3", hint: "Third tile on Home", softOnly: true },
];

/** Every colour token in styles.css, in the order the Advanced list shows them. */
export const THEME_TOKENS = [
  { name: "background", label: "Page", group: "Page and cards" },
  { name: "foreground", label: "Text", group: "Page and cards" },
  { name: "card", label: "Cards", group: "Page and cards" },
  { name: "card-foreground", label: "Text on cards", group: "Page and cards" },
  { name: "popover", label: "Pop-up lists", group: "Page and cards" },
  { name: "popover-foreground", label: "Text in pop-up lists", group: "Page and cards" },
  { name: "muted", label: "Chips and soft boxes", group: "Page and cards" },
  { name: "muted-foreground", label: "Quieter text", group: "Page and cards" },
  { name: "border", label: "Lines", group: "Page and cards" },
  { name: "input", label: "Box outlines", group: "Page and cards" },
  { name: "primary", label: "Main colour", group: "Buttons" },
  { name: "primary-foreground", label: "Text on the main colour", group: "Buttons" },
  { name: "ring", label: "Focus ring", group: "Buttons" },
  { name: "secondary", label: "Second buttons", group: "Buttons" },
  { name: "secondary-foreground", label: "Text on second buttons", group: "Buttons" },
  { name: "accent", label: "Highlighted rows", group: "Buttons" },
  { name: "accent-foreground", label: "Text on highlighted rows", group: "Buttons" },
  { name: "nav", label: "Menu background", group: "Menus" },
  { name: "nav-foreground", label: "Menu text", group: "Menus" },
  { name: "nav-active", label: "Current menu item", group: "Menus" },
  { name: "dock", label: "Phone bar", group: "Menus" },
  { name: "destructive", label: "Danger", group: "Status" },
  { name: "destructive-foreground", label: "Text on danger", group: "Status" },
  { name: "success", label: "Done", group: "Status" },
  { name: "warning", label: "Warning", group: "Status" },
  { name: "info", label: "Info", group: "Status" },
  { name: "hero", label: "Home card", group: "Home (Soft look)" },
  { name: "hero-foreground", label: "Text on the Home card", group: "Home (Soft look)" },
  { name: "tile-1", label: "Tile 1", group: "Home (Soft look)" },
  { name: "tile-2", label: "Tile 2", group: "Home (Soft look)" },
  { name: "tile-3", label: "Tile 3", group: "Home (Soft look)" },
  { name: "tile-foreground", label: "Text on tiles", group: "Home (Soft look)" },
] as const;

export type TokenName = (typeof THEME_TOKENS)[number]["name"];
export type ThemeTokens = Record<TokenName, string>;
export type TokenOverrides = Partial<ThemeTokens>;

const TOKEN_NAMES = new Set<string>(THEME_TOKENS.map((token) => token.name));
export const isTokenName = (value: string): value is TokenName => TOKEN_NAMES.has(value);

/** Only "#rrggbb" is ever saved or written into CSS. */
export const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/** The built-in themes a new theme can start from, as key colours. */
export const STARTERS: { id: string; label: string; look: Look; keyColours: KeyColours }[] = [
  {
    id: "grid",
    label: "Grid",
    look: "grid",
    keyColours: { page: "#0c0d0f", card: "#16191b", text: "#f2f2ef", main: "#f7d22a", hero: "#16191b", tile1: "#24272a", tile2: "#24272a", tile3: "#24272a" },
  },
  {
    id: "grid-light",
    label: "Grid light",
    look: "grid",
    keyColours: { page: "#f5f7f9", card: "#ffffff", text: "#13161b", main: "#ca3500", hero: "#ffffff", tile1: "#eceff2", tile2: "#eceff2", tile3: "#eceff2" },
  },
  {
    id: "soft",
    label: "Soft",
    look: "soft",
    keyColours: { page: "#f1f1f4", card: "#ffffff", text: "#1f1c3b", main: "#2b2849", hero: "#2b2849", tile1: "#b8a5fa", tile2: "#fddcb4", tile3: "#e8fb4f" },
  },
  {
    id: "soft-dark",
    label: "Soft dark",
    look: "soft",
    keyColours: { page: "#14122a", card: "#1f1d3a", text: "#f1f0fb", main: "#b8a5fa", hero: "#34306a", tile1: "#b8a5fa", tile2: "#fddcb4", tile3: "#e8fb4f" },
  },
];

export function starterOf(id: string | null | undefined) {
  return STARTERS.find((starter) => starter.id === id) ?? STARTERS[0]!;
}

// --- Colour maths (sRGB hex) -------------------------------------------------

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0")).join("")}`;
}

/** `amount` of `towards` mixed into `base` (0 = base, 1 = towards). */
export function mix(base: string, towards: string, amount: number): string {
  const from = channels(base);
  const to = channels(towards);
  return toHex(...(from.map((channel, index) => channel + (to[index]! - channel) * amount) as [number, number, number]));
}

/** How bright a colour looks (WCAG relative luminance, 0 black to 1 white). */
export function luminance(hex: string): number {
  const [red, green, blue] = channels(hex).map((channel) => {
    const share = channel / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG contrast ratio, 1 (none) to 21 (black on white). */
export function contrast(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

export const isDark = (hex: string) => luminance(hex) < 0.18;

/** Whichever of the two reads better on `background`. */
function clearer(background: string, first: string, second: string): string {
  return contrast(background, first) >= contrast(background, second) ? first : second;
}

/** Dark ink or white, whichever is easier to read on `background`. */
export function readableOn(background: string, darkInk = "#15171b"): string {
  return clearer(background, darkInk, "#ffffff");
}

// --- Working out every token --------------------------------------------------

const STATUS_ON_DARK = { destructive: "#ff7a73", success: "#6ed889", warning: "#ffda66", info: "#80c7f8" };
const STATUS_ON_LIGHT = { destructive: "#d01d21", success: "#1c8742", warning: "#a86f00", info: "#0f74c5" };

/** Every colour token from the key colours, as the built-in themes are put together. */
export function deriveTokens(key: KeyColours, look: Look): ThemeTokens {
  const dark = isDark(key.page);
  const status = dark ? STATUS_ON_DARK : STATUS_ON_LIGHT;
  const muted = mix(key.card, key.text, dark ? 0.06 : 0.035);
  const mutedText = mix(key.text, key.page, dark ? 0.3 : 0.38);
  const accent = mix(key.card, key.main, dark ? 0.18 : 0.14);
  // In the Grid look the Home card and tiles are just cards and chips.
  const hero = look === "soft" ? key.hero : key.card;
  const tiles = look === "soft" ? [key.tile1, key.tile2, key.tile3] : [muted, muted, muted];
  return {
    background: key.page,
    foreground: key.text,
    card: key.card,
    "card-foreground": key.text,
    popover: dark ? mix(key.card, key.text, 0.025) : key.card,
    "popover-foreground": key.text,
    muted,
    "muted-foreground": mutedText,
    border: mix(key.card, key.text, dark ? 0.1 : 0.09),
    input: mix(key.card, key.text, dark ? 0.16 : 0.2),
    primary: key.main,
    "primary-foreground": readableOn(key.main),
    ring: key.main,
    secondary: muted,
    "secondary-foreground": key.text,
    accent,
    "accent-foreground": clearer(accent, key.text, key.main),
    nav: key.page,
    "nav-foreground": mutedText,
    "nav-active": key.main,
    dock: key.card,
    destructive: status.destructive,
    "destructive-foreground": readableOn(status.destructive),
    success: status.success,
    warning: status.warning,
    info: status.info,
    hero,
    "hero-foreground": clearer(hero, key.text, readableOn(hero)),
    "tile-1": tiles[0]!,
    "tile-2": tiles[1]!,
    "tile-3": tiles[2]!,
    "tile-foreground": look === "soft" ? readableOn(key.tile1, "#1f1c3b") : key.text,
  };
}

/** The finished colours: worked out from the key colours, then anything set by hand. */
export function resolveTokens(key: KeyColours, look: Look, overrides: TokenOverrides = {}): ThemeTokens {
  const tokens = deriveTokens(key, look);
  for (const [name, value] of Object.entries(overrides)) {
    if (isTokenName(name) && typeof value === "string" && HEX_COLOUR.test(value)) tokens[name] = value.toLowerCase();
  }
  return tokens;
}

// --- Readability --------------------------------------------------------------

export interface ReadabilityWarning {
  /** What's hard to read, in plain words. */
  label: string;
  text: TokenName;
  background: TokenName;
  ratio: number;
  /** The ratio it should reach. */
  needs: number;
}

/** Text should reach 4.5 : 1 (WCAG AA). Status colours are small marks, so 3 : 1. */
const PAIRS: { label: string; text: TokenName; background: TokenName; needs: number; softOnly?: boolean }[] = [
  { label: "Text on the page", text: "foreground", background: "background", needs: 4.5 },
  { label: "Text on cards", text: "card-foreground", background: "card", needs: 4.5 },
  { label: "Quieter text on cards", text: "muted-foreground", background: "card", needs: 4.5 },
  { label: "Text on chips", text: "foreground", background: "muted", needs: 4.5 },
  { label: "Button text", text: "primary-foreground", background: "primary", needs: 4.5 },
  { label: "Highlighted rows", text: "accent-foreground", background: "accent", needs: 4.5 },
  { label: "Menu text", text: "nav-foreground", background: "nav", needs: 4.5 },
  { label: "Current menu item", text: "nav-active", background: "nav", needs: 3 },
  { label: "Links on cards", text: "primary", background: "card", needs: 3 },
  { label: "Danger colour on cards", text: "destructive", background: "card", needs: 3 },
  { label: "Warning colour on cards", text: "warning", background: "card", needs: 3 },
  { label: "Done colour on cards", text: "success", background: "card", needs: 3 },
  { label: "Text on the Home card", text: "hero-foreground", background: "hero", needs: 4.5, softOnly: true },
  { label: "Text on tile 1", text: "tile-foreground", background: "tile-1", needs: 4.5, softOnly: true },
  { label: "Text on tile 2", text: "tile-foreground", background: "tile-2", needs: 4.5, softOnly: true },
  { label: "Text on tile 3", text: "tile-foreground", background: "tile-3", needs: 4.5, softOnly: true },
];

/** Every pair of colours that's hard to read, worst first. Shown as warnings; saving still works. */
export function readabilityWarnings(tokens: ThemeTokens, look: Look): ReadabilityWarning[] {
  return PAIRS.filter((pair) => look === "soft" || !pair.softOnly)
    .map((pair) => ({ ...pair, ratio: Math.round(contrast(tokens[pair.text], tokens[pair.background]) * 10) / 10 }))
    .filter((pair) => pair.ratio < pair.needs)
    .sort((first, second) => first.ratio / first.needs - second.ratio / second.needs)
    .map(({ label, text, background, ratio, needs }) => ({ label, text, background, ratio, needs }));
}

// --- Putting it on the page --------------------------------------------------

/** The CSS custom properties, for a style attribute (the editor's preview). */
export function tokenStyle(tokens: ThemeTokens): Record<string, string> {
  const style: Record<string, string> = { colorScheme: isDark(tokens.background) ? "dark" : "light" };
  for (const token of THEME_TOKENS) style[`--${token.name}`] = tokens[token.name];
  return style;
}

/**
 * The stylesheet for <html data-theme="custom">. Only checked hex values go
 * in, so nothing typed into a theme can break out of the rule.
 */
export function tokensCss(tokens: ThemeTokens): string {
  const lines = THEME_TOKENS.map((token) => tokens[token.name])
    .every((value) => HEX_COLOUR.test(value))
    ? THEME_TOKENS.map((token) => `--${token.name}:${tokens[token.name]};`)
    : [];
  return `:root[data-theme="custom"]{color-scheme:${isDark(tokens.background) ? "dark" : "light"};${lines.join("")}}`;
}

/** The id of the <style> element holding a custom theme's colours. */
export const CUSTOM_THEME_STYLE_ID = "grid-custom-theme";
