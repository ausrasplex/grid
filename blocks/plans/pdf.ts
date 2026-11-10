// Turning plan PDFs (and images) into something a tablet can zoom: each
// page is rendered once with poppler's pdftoppm at a resolution that
// keeps fine print readable, then cut into deep-zoom tiles with sharp.
// Tiles live in <files>/.cache/plans/<versionId> and can always be made
// again from the original, so backups skip them.

import "server-only";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { cacheRoot } from "@grid/db";

/** Biggest render, in pixels: an A1 sheet at ~250 dpi, A0 at ~175 (2.5 mm text stays sharp). */
const MAX_PIXELS = 48_000_000;
const MAX_DPI = 250;
const MIN_DPI = 100;

function run(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let error = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} took too long`));
    }, timeoutMs);
    child.stdout.on("data", (event) => (out.length < 2_000_000 ? (out += event) : null));
    child.stderr.on("data", (event) => (error += event));
    child.on("error", (event) => (clearTimeout(timer), reject(event)));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} failed: ${error.trim().split("\n").at(-1) || `exit ${code}`}`));
    });
  });
}

export interface PdfPage {
  page: number;
  widthPt: number;
  heightPt: number;
}

/** Every page with its size in points. */
export async function pdfPages(file: string): Promise<PdfPage[]> {
  const info = await run("pdfinfo", ["-f", "1", "-l", "2000", file], 60_000);
  const pages: PdfPage[] = [];
  for (const match of info.matchAll(/^Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/gm)) {
    pages.push({ page: Number(match[1]), widthPt: Number(match[2]), heightPt: Number(match[3]) });
  }
  if (!pages.length) {
    const total = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 0);
    const size = /^Page size:\s+([\d.]+)\s+x\s+([\d.]+)/m.exec(info);
    for (let index = 1; index <= total; index++) pages.push({ page: index, widthPt: Number(size?.[1] ?? 0), heightPt: Number(size?.[2] ?? 0) });
  }
  return pages;
}

/**
 * The text of a page's title block area (bottom right, where most title
 * blocks sit), falling back to the whole page.
 */
export async function titleBlockText(file: string, page: PdfPage): Promise<string> {
  const args = (crop: boolean) => [
    "-f", String(page.page), "-l", String(page.page), "-layout", "-r", "72",
    ...(crop ? ["-x", String(Math.round(page.widthPt * 0.55)), "-y", String(Math.round(page.heightPt * 0.6)), "-W", String(Math.round(page.widthPt * 0.45)), "-H", String(Math.round(page.heightPt * 0.4))] : []),
    file, "-",
  ];
  try {
    const corner = await run("pdftotext", args(true), 30_000);
    if (/drawing|dwg|sheet|title|rev/i.test(corner)) return corner.slice(0, 20_000);
    return (await run("pdftotext", args(false), 30_000)).slice(0, 40_000);
  } catch {
    return "";
  }
}

export function dpiFor(page: { widthPt: number; heightPt: number }) {
  const squareInches = (page.widthPt / 72) * (page.heightPt / 72);
  if (!squareInches) return 150;
  return Math.max(MIN_DPI, Math.min(MAX_DPI, Math.floor(Math.sqrt(MAX_PIXELS / squareInches))));
}

export const tilesDir = (versionId: string) => cacheRoot("plans", versionId);

/**
 * Renders one page (or an image) to tiles + a thumbnail. Returns the
 * rendered size. Writes into a temporary folder, then swaps it in.
 */
export async function renderToTiles(input: { file: string; mime: string; page: number; versionId: string; widthPt?: number | null; heightPt?: number | null }) {
  const work = await mkdtemp(path.join(tmpdir(), "grid-plan-"));
  try {
    let source: string;
    let dpi: number | null = null;
    if (input.mime === "application/pdf") {
      dpi = dpiFor({ widthPt: input.widthPt ?? 0, heightPt: input.heightPt ?? 0 });
      const prefix = path.join(work, "page");
      await run("pdftoppm", ["-f", String(input.page), "-l", String(input.page), "-r", String(dpi), "-png", "-singlefile", "-aa", "yes", "-aaVector", "yes", input.file, prefix], 10 * 60_000);
      source = `${prefix}.png`;
    } else {
      source = input.file;
    }
    const image = sharp(source, { limitInputPixels: false }).rotate();
    const meta = await image.metadata();
    const out = path.join(work, "out");
    await mkdir(out);
    await sharp(source, { limitInputPixels: false })
      .rotate()
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 86, mozjpeg: true })
      .tile({ size: 512, overlap: 1, layout: "dz" })
      .toFile(path.join(out, "plan.dz"));
    await sharp(source, { limitInputPixels: false })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: 640, height: 640, fit: "inside" })
      .jpeg({ quality: 78 })
      .toFile(path.join(out, "thumb.jpg"));
    const sideways = (meta.orientation ?? 1) >= 5;
    const final = tilesDir(input.versionId);
    await mkdir(path.dirname(final), { recursive: true });
    await rm(final, { recursive: true, force: true });
    await rename(out, final).catch(async () => {
      // Different disks (tmp vs the files share): copy instead.
      const { cp: copyFolder } = await import("node:fs/promises");
      await copyFolder(out, final, { recursive: true });
    });
    return { widthPx: (sideways ? meta.height : meta.width) ?? 0, heightPx: (sideways ? meta.width : meta.height) ?? 0, dpi };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export async function removeTiles(versionId: string) {
  await rm(tilesDir(versionId), { recursive: true, force: true });
}
