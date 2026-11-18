// Getting a document version ready for the in-app viewer, kept in
// <files>/.cache/documents/<versionId> (Grid can make it again from the
// original, so backups skip it): a PDF's page pictures (at the server's
// Documents level, Settings › Plans & PDFs, by the shared renderPdfPages in
// @grid/db), or a spreadsheet's per-sheet JSON.

import "server-only";
import { cp, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cacheRoot, getRenderingSettings, pageDpi, pdfLongestSideInches, pdfPageFile, renderPdfPages as renderPages } from "@grid/db";

export const pagesDir = (versionId: string) => cacheRoot("documents", versionId);

/** "p12.jpg" for page 12. */
export const pageFile = pdfPageFile;

/** Renders every page of a version's PDF at the server's Documents level. Returns each page's size in pixels, in page order. */
export async function renderPdfPages(file: string, versionId: string) {
  const { documents } = await getRenderingSettings();
  return renderPages(file, pagesDir(versionId), { dpi: pageDpi(documents, await pdfLongestSideInches(file)) });
}

/** "sheet-0.json" for the first sheet. */
export const sheetFile = (index: number) => `sheet-${index}.json`;

/** Writes each sheet's viewer JSON for a version (into a temporary folder, then swapped in). */
export async function writeSheets(versionId: string, sheets: unknown[]) {
  const work = await mkdtemp(path.join(tmpdir(), "grid-sheet-"));
  try {
    for (const [index, sheet] of sheets.entries()) await writeFile(path.join(work, sheetFile(index)), JSON.stringify(sheet));
    const final = pagesDir(versionId);
    await mkdir(path.dirname(final), { recursive: true });
    await rm(final, { recursive: true, force: true });
    await rename(work, final).catch(() => cp(work, final, { recursive: true }));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export async function removePages(versionId: string) {
  await rm(pagesDir(versionId), { recursive: true, force: true });
}
