"use client";

// Bits the Themes list, the editor and Settings › Appearance share.
import { useRouter } from "next/navigation";
import { api, resolveTokens, showThemeNow, tokensCss, useAction, type KeyColours, type TokenOverrides } from "@grid/ui";

/** A theme as the API sends it (service.ts ThemeView). */
export interface ThemeJson {
  id: string;
  name: string;
  description: string;
  look: "grid" | "soft";
  startedFrom: string;
  keyColours: KeyColours;
  overrides: TokenOverrides;
  scope: "mine" | "business";
  canEdit: boolean;
  updatedAt: string;
}

export interface ThemeList {
  mine: ThemeJson[];
  business: ThemeJson[];
  current: string;
  canManageBusiness: boolean;
  solo: boolean;
}

/** The theme's finished colours. */
export const tokensOf = (theme: Pick<ThemeJson, "keyColours" | "look" | "overrides">) => resolveTokens(theme.keyColours, theme.look, theme.overrides);

/** A few round samples: page, cards, main colour, and the tiles in the Soft look. */
export function Swatches({ theme, className }: { theme: Pick<ThemeJson, "keyColours" | "look" | "overrides">; className?: string }) {
  const tokens = tokensOf(theme);
  const colours = [tokens.background, tokens.card, tokens.primary, ...(theme.look === "soft" ? [tokens["tile-1"], tokens["tile-2"], tokens["tile-3"]] : [])];
  return (
    <span aria-hidden className={`flex shrink-0 -space-x-1.5 ${className ?? ""}`}>
      {colours.map((colour, index) => (
        <span key={index} className="size-6 rounded-full border-2 border-card" style={{ background: colour }} />
      ))}
    </span>
  );
}

/** Switch to one of these themes for you (User.settings.theme = "custom:<id>"), shown straight away. */
export function useUseTheme() {
  const router = useRouter();
  const action = useAction();
  const use = async (theme: ThemeJson) => {
    const ok = await action.run(() => api("/users/me", { method: "PATCH", body: { settings: { theme: `custom:${theme.id}` } } }));
    if (ok === undefined) return false;
    showThemeNow({ "data-theme": "custom", "data-look": theme.look }, tokensCss(tokensOf(theme)));
    router.refresh();
    return true;
  };
  return { ...action, use };
}

/** Saves a theme to a file (Export), for another Grid server. */
export async function downloadTheme(theme: Pick<ThemeJson, "id" | "name">) {
  const file = await api(`/themes/${theme.id}/export`);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${theme.name.replace(/[^\w\- ]+/g, "").trim() || "theme"}.grid-theme.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Reads a theme file picked on the device and adds it (to yours, or the business's). */
export async function importThemeFile(file: File, scope: "mine" | "business"): Promise<ThemeJson> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't a Grid theme (it couldn't be read).");
  }
  return api<ThemeJson>("/themes/import", { body: { scope, file: parsed } });
}
