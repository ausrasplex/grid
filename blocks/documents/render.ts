// Turning a document PDF into page pictures for the in-app viewer: every
// page rendered once with poppler's pdftoppm (2000 px on the long side,
// sharp enough to zoom into on a phone), plus a small thumbnail of the
// first page. Kept in <files>/.cache/documents/<versionId>: Grid can make
// them again from the original, so backups skip them.

import "server-only";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { cacheRoot } from "@grid/db";

/** Long side of a rendered page, in pixels. */
export const PAGE_EDGE = 2000;

function run(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let error = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} took too long`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (out.length < 2_000_000 ? (out += chunk) : null));
    child.stderr.on("data", (chunk) => (error += chunk));
    child.on("error", (failure) => (clearTimeout(timer), reject(failure)));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} failed: ${error.trim().split("\n").at(-1) || `exit ${code}`}`));
    });
  });
}

export const pagesDir = (versionId: string) => cacheRoot("documents", versionId);

/** "p12.jpg" for page 12. */
export const pageFile = (page: number) => `p${page}.jpg`;

/**
 * Renders every page of a PDF. Returns each page's size in pixels, in
 * page order. Writes into a temporary folder, then swaps it in.
 */
export async function renderPdfPages(file: string, versionId: string): Promise<[number, number][]> {
  const work = await mkdtemp(path.join(tmpdir(), "grid-doc-"));
  try {
    const out = path.join(work, "out");
    await mkdir(out);
    // pdftoppm names pages page-01.jpg, page-002.jpg… depending on the count.
    await run("pdftoppm", ["-jpeg", "-jpegopt", "quality=82", "-scale-to", String(PAGE_EDGE), "-aa", "yes", "-aaVector", "yes", file, path.join(work, "page")], 30 * 60_000);
    const rendered = (await readdir(work))
      .map((name) => ({ name, page: Number(/^page-(\d+)\.jpg$/.exec(name)?.[1] ?? 0) }))
      .filter((entry) => entry.page > 0)
      .sort((first, second) => first.page - second.page);
    if (!rendered.length) throw new Error("The PDF has no pages Grid can read");
    const sizes: [number, number][] = [];
    for (const [index, entry] of rendered.entries()) {
      const source = path.join(work, entry.name);
      const meta = await sharp(source).metadata();
      sizes.push([meta.width ?? 0, meta.height ?? 0]);
      await rename(source, path.join(out, pageFile(index + 1)));
    }
    await sharp(path.join(out, pageFile(1))).resize({ width: 480, height: 480, fit: "inside" }).jpeg({ quality: 76 }).toFile(path.join(out, "thumb.jpg"));
    const final = pagesDir(versionId);
    await mkdir(path.dirname(final), { recursive: true });
    await rm(final, { recursive: true, force: true });
    // Different disks (tmp vs the files share): copy instead.
    await rename(out, final).catch(() => cp(out, final, { recursive: true }));
    return sizes;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export async function removePages(versionId: string) {
  await rm(pagesDir(versionId), { recursive: true, force: true });
}
