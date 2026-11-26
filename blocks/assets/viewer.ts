// Showing an asset's manual or certificate inside Grid (CLAUDE.md "PDFs":
// never a new tab, which leaves the installed app). A PDF is turned into
// page pictures once, kept in the cache (Grid can rebuild them), and shown
// with PageViewer; a picture shows as it is.

import "server-only";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { notFound, requireCompany, type RequestContext } from "@grid/core";
import { cacheRoot, db, getRenderingSettings, pageDpi, pdfLongestSideInches, renderPdfPages, storedFilePath } from "@grid/db";

/** A file the asset can show: one of its documents (or a copy's shared one), or a test's certificate. */
async function viewableFile(companyId: string, assetId: string, fileId: string) {
  const asset = await db.asset.findFirst({ where: { id: assetId, companyId, deletedAt: null }, select: { id: true, docSetId: true } });
  if (!asset) throw notFound("Asset not found");
  const [document, check] = await Promise.all([
    db.assetDocument.findFirst({ where: { companyId, fileId, deletedAt: null, asset: { OR: [{ id: assetId }, ...(asset.docSetId ? [{ docSetId: asset.docSetId }] : [])] } }, select: { title: true } }),
    db.assetCheck.findFirst({ where: { companyId, assetId, deletedAt: null, fileIds: { has: fileId } }, select: { title: true } }),
  ]);
  if (!document && !check) throw notFound("That file isn't on this asset");
  const file = await db.storedFile.findFirst({ where: { id: fileId, companyId, purgedAt: null } });
  if (!file) throw notFound("That file has gone");
  return { file, title: document?.title ?? file.originalName ?? check!.title };
}

const folderFor = (fileId: string, level: string) => cacheRoot("assets", fileId, `pages-${level}`);

/** What the viewer shows: page pictures for a PDF, or the picture itself. */
export async function viewFile(ctx: RequestContext, assetId: string, fileId: string) {
  const companyId = requireCompany(ctx);
  const { file, title } = await viewableFile(companyId, assetId, fileId);
  if (file.mime.startsWith("image/")) return { title, kind: "image" as const, level: null, pages: [] as [number, number][] };
  if (file.mime !== "application/pdf") return { title, kind: "download" as const, level: null, pages: [] as [number, number][] };
  const { quotes: level } = await getRenderingSettings();
  const folder = folderFor(fileId, level);
  let sizes = await readFile(/*turbopackIgnore: true*/ path.join(folder, "sizes.json"), "utf8")
    .then((text) => JSON.parse(text) as [number, number][])
    .catch(() => null);
  if (!sizes) {
    const source = storedFilePath(file);
    sizes = await renderPdfPages(source, folder, { dpi: pageDpi(level, await pdfLongestSideInches(source)), timeoutMs: 2 * 60_000 });
    await writeFile(/*turbopackIgnore: true*/ path.join(folder, "sizes.json"), JSON.stringify(sizes));
  }
  return { title, kind: "pdf" as const, level, pages: sizes };
}

/** One page picture ("p2.jpg"). A file's pictures never change, so phones keep them. */
export async function pagePicture(ctx: RequestContext, assetId: string, fileId: string, level: string, name: string) {
  const companyId = requireCompany(ctx);
  await viewableFile(companyId, assetId, fileId);
  if (!/^[A-Z]+$/.test(level) || !/^p\d{1,4}\.jpg$/.test(name)) throw notFound();
  const full = path.join(folderFor(fileId, level), name);
  try {
    const stats = await stat(/*turbopackIgnore: true*/ full);
    return new Response(Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ full)) as ReadableStream, {
      headers: { "content-type": "image/jpeg", "content-length": String(stats.size), "cache-control": "private, max-age=31536000, immutable" },
    });
  } catch {
    throw notFound();
  }
}
