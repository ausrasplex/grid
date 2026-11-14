// Grid's app icon. The one source is public/icon.png at the top of the
// repo (any size, square). Every size the app needs (browser tab, install
// manifest, iPhone home screen, the mark in the menus and on sign-in) is
// made from it when Grid is built, so replacing that file and rebuilding
// updates them all.

import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** The icon's own background, for the install splash screen. */
export const ICON_BACKGROUND = "#000000";

async function source(): Promise<Buffer> {
  // Built from apps/web (pnpm --filter) or from the repo root.
  const places = [path.join(process.cwd(), "..", "..", "public", "icon.png"), path.join(process.cwd(), "public", "icon.png")];
  for (const place of places) {
    try {
      return await readFile(/*turbopackIgnore: true*/ place);
    } catch {
      /* try the next place */
    }
  }
  throw new Error("public/icon.png is missing: Grid's app icon is made from it");
}

/**
 * The icon as a PNG of `size` pixels. `tight` crops the empty border off
 * first (keeping a slim one), so small icons (the browser tab, the menu
 * mark) show the picture, not mostly background.
 */
export async function appIconPng(size: number, options: { tight?: boolean } = {}): Promise<Response> {
  const sharp = (await import("sharp")).default;
  let input = await source();
  if (options.tight) {
    const { data, info } = await sharp(input).trim({ threshold: 20 }).toBuffer({ resolveWithObject: true });
    const margin = Math.round(Math.max(info.width, info.height) * 0.12);
    input = await sharp(data).extend({ top: margin, bottom: margin, left: margin, right: margin, background: ICON_BACKGROUND }).toBuffer();
  }
  const png = await sharp(input).resize(size, size, { fit: "contain", background: ICON_BACKGROUND }).png().toBuffer();
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } });
}
