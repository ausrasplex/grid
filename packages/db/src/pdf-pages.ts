// Turning a PDF into page pictures for the in-app PDF viewer (Documents,
// quote PDFs): every page rendered with poppler's pdftoppm, plus a small
// thumbnail of the first page. Callers pick the folder, normally under
// cacheRoot() since Grid can make the pictures again from the PDF.

import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

/** Runs a command-line tool and returns what it printed (stopped after `timeoutMs`). */
export function runTool(cmd: string, args: string[], timeoutMs: number): Promise<string> {
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

/** The longest side of the PDF's biggest page, in inches (0 if pdfinfo can't tell). */
export async function pdfLongestSideInches(file: string): Promise<number> {
  try {
    const info = await runTool("pdfinfo", ["-f", "1", "-l", "5000", file], 60_000);
    let longest = 0;
    for (const match of info.matchAll(/size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/g)) longest = Math.max(longest, Number(match[1]), Number(match[2]));
    return longest / 72;
  } catch {
    return 0;
  }
}

/** "p12.jpg" for page 12. */
export const pdfPageFile = (page: number) => `p${page}.jpg`;

/**
 * Renders every page of the PDF at `file` into `folder` (p1.jpg, p2.jpg…
 * and thumb.jpg), at `dpi` (see pageDpi in render-levels.ts), or `edge`
 * pixels on each page's long side. Returns each page's size in pixels, in
 * page order. Works in a temporary folder, then swaps it in, so a
 * half-finished render is never served.
 */
export async function renderPdfPages(file: string, folder: string, options: { dpi?: number; edge?: number; timeoutMs?: number } = {}): Promise<[number, number][]> {
  const work = await mkdtemp(path.join(tmpdir(), "grid-pdf-"));
  try {
    const out = path.join(work, "out");
    await mkdir(out);
    // pdftoppm names pages page-01.jpg, page-002.jpg… depending on the count.
    const size = options.dpi ? ["-r", String(options.dpi)] : ["-scale-to", String(options.edge ?? 2000)];
    await runTool("pdftoppm", ["-jpeg", "-jpegopt", "quality=82", ...size, "-aa", "yes", "-aaVector", "yes", file, path.join(work, "page")], options.timeoutMs ?? 30 * 60_000);
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
      await rename(source, path.join(out, pdfPageFile(index + 1)));
    }
    await sharp(path.join(out, pdfPageFile(1))).resize({ width: 480, height: 480, fit: "inside" }).jpeg({ quality: 76 }).toFile(path.join(out, "thumb.jpg"));
    await mkdir(path.dirname(folder), { recursive: true });
    await rm(folder, { recursive: true, force: true });
    // Different disks (tmp vs the files share): copy instead.
    await rename(out, folder).catch(() => cp(out, folder, { recursive: true }));
    return sizes;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
