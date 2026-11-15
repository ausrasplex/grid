// Grid's looks, picked per person in Settings › Profile › Appearance
// (User.settings.theme). docs/visual-style.md "Themes".
//
//   Grid (concept C)  dark graphite, hi-vis yellow. The default.
//   Grid light        the concept A palette on the same layout
//   Soft              Folio's Lilac theme: light grey page, white cards, navy and pastel tiles,
//                     Plus Jakarta Sans, pill buttons; its own sidebar
//                     and Home. Light, dark, or following the device.
//
// <html data-theme="…"> picks the colours (styles.css); data-look="soft"
// switches the rounder shapes and the Soft sidebar and Home.

export const THEMES = [
  { id: "grid", label: "Grid", description: "Dark graphite with hi-vis yellow", look: "grid" },
  { id: "grid-light", label: "Grid light", description: "Light, with safety orange", look: "grid" },
  { id: "soft", label: "Soft", description: "Light grey, navy and pastel, rounded", look: "soft" },
  { id: "soft-dark", label: "Soft dark", description: "The Soft shapes on dark navy", look: "soft" },
  { id: "soft-system", label: "Soft, match my device", description: "Soft light by day, Soft dark when your device is dark", look: "soft" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type Look = "grid" | "soft";

export function themeOf(value: unknown): ThemeId {
  return THEMES.some((theme) => theme.id === value) ? (value as ThemeId) : "grid";
}

export function lookOf(theme: ThemeId): Look {
  return THEMES.find((entry) => entry.id === theme)?.look ?? "grid";
}

/** The attributes for <html>. Grid (dark) has no data-theme: it's the :root default. */
export function themeAttributes(theme: ThemeId): { "data-theme"?: string; "data-look": Look } {
  const dataTheme = theme === "grid" ? undefined : theme === "grid-light" ? "light" : theme;
  return { ...(dataTheme ? { "data-theme": dataTheme } : {}), "data-look": lookOf(theme) };
}

/** The phone's status bar colour (matches the page background). */
export function themeColour(theme: ThemeId): string {
  switch (theme) {
    case "grid-light":
      return "#f6f7f9";
    case "soft":
    case "soft-system":
      return "#f1f1f4";
    case "soft-dark":
      return "#14122a";
    default:
      return "#15171b";
  }
}
