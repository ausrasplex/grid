// The handover PDF (docs/materials-block.md §3): a landscape A4 "Fixtures &
// Finishes Schedule", by trade then room. Made on request from the list
// and kept in <files>/.cache/handover/<job>/<key> until the list changes
// (key = a fingerprint of everything that prints), with its page pictures
// for showing it inside Grid. Used signed in and by the client's link.

import "server-only";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { notFound, requireCompany, type RequestContext } from "@grid/core";
import { cacheRoot, db, folderBytes, getRenderingSettings, openStoredFile, pageDpi, pdfLongestSideInches, renderPdfPages, type FileVariant } from "@grid/db";
import { canSeeJob } from "@grid/block-projects";
import { materialsForCompany, type MaterialRow } from "@grid/block-materials";
import { columnsFor, type Column } from "./columns";
import { formatQty, groupSchedule, preparedDate } from "./schedule";
import { companySettingsFor, jobSettingsFor, printedTrade, sortNameOf, TRADE_ORDER } from "./service";

export interface PrintLine {
  id: string;
  /** The item type ("Downlights"). */
  item: string;
  photoFileId: string | null;
  swatch: string | null;
  /** "Beacon Lighting – Masson Accent Minitrim". */
  product: string;
  model: string | null;
  finish: string | null;
  size: string | null;
  qty: string;
  link: string | null;
  notes: string | null;
}

export interface PrintSection {
  trade: string;
  /** As it prints ("Lighting & Electrical"). */
  name: string;
  columns: Column[];
  rooms: { room: string | null; lines: PrintLine[] }[];
}

export interface ScheduleModel {
  title: string;
  jobName: string;
  siteName: string;
  address: string;
  clientName: string | null;
  cover: boolean;
  coverFileId: string | null;
  roomPerPage: boolean;
  showQty: boolean;
  sections: PrintSection[];
  lineCount: number;
}

const product = (material: MaterialRow) => [material.brand, material.name].filter(Boolean).join(" – ");

/** Everything that prints, for a job (no signed-in person needed: the client's link uses it too). */
export async function scheduleModel(companyId: string, projectId: string): Promise<ScheduleModel> {
  const project = await db.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { name: true, siteId: true, clientId: true, clientName: true } });
  if (!project) throw notFound("Job not found");
  const [site, client, items, settings, company] = await Promise.all([
    db.site.findUnique({ where: { id: project.siteId }, select: { name: true, address: true } }),
    project.clientId ? db.client.findFirst({ where: { id: project.clientId, companyId }, select: { name: true } }) : null,
    db.handoverItem.findMany({ where: { companyId, projectId }, orderBy: { createdAt: "asc" } }),
    jobSettingsFor(projectId),
    companySettingsFor(companyId),
  ]);
  const materials = await materialsForCompany(companyId, items.map((item) => item.materialId));
  const lines = items.flatMap((item) => {
    const material = materials.get(item.materialId);
    if (!material) return [];
    const print: PrintLine = {
      id: item.id,
      item: material.itemType ?? "",
      photoFileId: material.photoFileId,
      swatch: material.photoFileId ? null : material.swatch,
      product: product(material),
      model: material.model,
      finish: material.finish,
      size: material.size,
      qty: formatQty(item.qty === null ? null : Number(item.qty)),
      link: material.link,
      notes: [item.note, material.notes].filter(Boolean).join("\n") || null,
    };
    return [{ trade: item.trade, room: item.room, sortName: sortNameOf(material), createdAt: item.createdAt, print }];
  });
  const groups = groupSchedule(lines, { tradeOrder: TRADE_ORDER, roomOrder: settings.roomOrder });
  return {
    title: settings.title || company.title,
    jobName: project.name,
    siteName: site?.name ?? "",
    address: site?.address ?? "",
    clientName: client?.name ?? project.clientName,
    cover: settings.cover,
    coverFileId: settings.cover ? settings.coverFileId : null,
    roomPerPage: settings.roomPerPage,
    showQty: settings.showQty,
    lineCount: lines.length,
    sections: groups.map((group) => {
      const rooms = group.rooms.map((room) => ({ room: room.room, lines: room.lines.map((line) => line.print) }));
      return {
        trade: group.trade,
        name: printedTrade(company, group.trade),
        columns: columnsFor(group.trade, {
          showQty: settings.showQty,
          hidden: company.tradeColumns[group.trade] ?? [],
          anyNotes: rooms.some((room) => room.lines.some((line) => line.notes)),
        }),
        rooms,
      };
    }),
  };
}

/** A file as a data: URL for the PDF (Chromium loads nothing from outside). */
async function dataUrl(companyId: string, fileId: string, variant: FileVariant): Promise<string | null> {
  const file = await db.storedFile.findFirst({ where: { id: fileId, companyId, purgedAt: null } });
  if (!file) return null;
  try {
    const { stream, mime } = await openStoredFile(file, variant);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`;
  } catch {
    return null;
  }
}

async function renderSchedule(companyId: string, model: ScheduleModel): Promise<Buffer> {
  const [{ themeFor, renderPdf, toHtml }, { HandoverDocument }, { createElement }] = await Promise.all([import("@grid/block-templates"), import("./document"), import("react")]);
  const theme = await themeFor(companyId);
  const images: Record<string, string> = {};
  // Small copies for the table (about 40 mm wide), the bigger one for the cover.
  const photoIds = [...new Set(model.sections.flatMap((section) => section.rooms.flatMap((room) => room.lines.flatMap((line) => (line.photoFileId ? [line.photoFileId] : [])))))];
  for (const id of photoIds) {
    const url = await dataUrl(companyId, id, "thumb");
    if (url) images[id] = url;
  }
  if (model.coverFileId) {
    const url = await dataUrl(companyId, model.coverFileId, "display");
    if (url) images[model.coverFileId] = url;
  }
  const html = await toHtml(createElement(HandoverDocument, { model, theme, images, prepared: preparedDate(new Date()) }));
  return renderPdf(html, { landscape: true, footer: [theme.companyName, theme.phone].filter(Boolean).join("  ·  ") });
}

const jobFolder = (projectId: string, ...parts: string[]) => cacheRoot("handover", projectId, ...parts);

/** The fingerprint of what prints: the list, the switches, the business's branding. */
async function fingerprint(companyId: string, model: ScheduleModel) {
  const theme = await db.docTheme.findUnique({ where: { companyId } });
  const company = await db.company.findUnique({ where: { id: companyId }, select: { name: true } });
  const branding = theme ? { ...theme, updatedAt: undefined } : null;
  return createHash("sha256").update(JSON.stringify({ model, branding, company })).digest("hex").slice(0, 24);
}

/** The PDF for a job, made now or from the cache. */
export async function cachedSchedule(companyId: string, projectId: string) {
  const model = await scheduleModel(companyId, projectId);
  const key = await fingerprint(companyId, model);
  const file = jobFolder(projectId, key, "handover.pdf");
  let pdf: Buffer | null = await readFile(/*turbopackIgnore: true*/ file).catch(() => null);
  if (!pdf) {
    pdf = await renderSchedule(companyId, model);
    await mkdir(jobFolder(projectId, key), { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ file, pdf);
    // Only the newest is kept.
    const others = await readdir(jobFolder(projectId), { withFileTypes: true }).catch(() => []);
    for (const entry of others) if (entry.isDirectory() && entry.name !== key) await rm(jobFolder(projectId, entry.name), { recursive: true, force: true });
  }
  return { key, pdf, model, filename: `${model.jobName} ${model.title}.pdf` };
}

export const pdfResponse = (pdf: Buffer, filename: string, download: boolean) =>
  new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename.replace(/[^\w.\-& ]/g, "")}"`,
      "cache-control": "private, no-store",
    },
  });

async function jobOrThrow(ctx: RequestContext, projectId: string) {
  if (!(await canSeeJob(ctx, projectId))) throw notFound("Job not found");
}

/** Download (signed in). */
export async function schedulePdf(ctx: RequestContext, projectId: string, download: boolean) {
  await jobOrThrow(ctx, projectId);
  const { pdf, filename } = await cachedSchedule(requireCompany(ctx), projectId);
  return pdfResponse(pdf, filename, download);
}

/** The PDF's pages as pictures, for showing it inside Grid. */
export async function schedulePages(companyId: string, projectId: string) {
  const { key, pdf, filename, model } = await cachedSchedule(companyId, projectId);
  const { quotes: level } = await getRenderingSettings();
  const folder = jobFolder(projectId, key, `pages-${level}`);
  let sizes = await readFile(/*turbopackIgnore: true*/ path.join(folder, "sizes.json"), "utf8")
    .then((text) => JSON.parse(text) as [number, number][])
    .catch(() => null);
  if (!sizes) {
    const work = await mkdtemp(path.join(tmpdir(), "grid-handover-pdf-"));
    try {
      const file = path.join(work, "handover.pdf");
      await writeFile(file, pdf);
      sizes = await renderPdfPages(file, folder, { dpi: pageDpi(level, await pdfLongestSideInches(file)), timeoutMs: 2 * 60_000 });
      await writeFile(/*turbopackIgnore: true*/ path.join(folder, "sizes.json"), JSON.stringify(sizes));
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
  return { key: `${key}-${level}`, pages: sizes, filename, title: model.title, lineCount: model.lineCount };
}

export async function schedulePagesFor(ctx: RequestContext, projectId: string) {
  await jobOrThrow(ctx, projectId);
  return schedulePages(requireCompany(ctx), projectId);
}

/** One page picture ("p2.jpg"). A key's pictures never change, so phones keep them. */
export async function pagePicture(projectId: string, pageKey: string, name: string) {
  const match = /^([0-9a-f]{24})-([A-Z]+)$/.exec(pageKey);
  if (!match || !/^p\d{1,4}\.jpg$/.test(name)) throw notFound();
  const full = jobFolder(projectId, match[1]!, `pages-${match[2]}`, name);
  try {
    const stats = await stat(/*turbopackIgnore: true*/ full);
    return new Response(Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ full)) as ReadableStream, {
      headers: { "content-type": "image/jpeg", "content-length": String(stats.size), "cache-control": "private, max-age=31536000, immutable" },
    });
  } catch {
    throw notFound();
  }
}

export async function pagePictureFor(ctx: RequestContext, projectId: string, pageKey: string, name: string) {
  await jobOrThrow(ctx, projectId);
  return pagePicture(projectId, pageKey, name);
}

/** Bytes kept for a job's PDFs and their pictures (the job's Storage section). */
export async function cachedBytes(projectId: string) {
  return folderBytes(jobFolder(projectId)).catch(() => 0);
}

export async function dropCache(projectId: string) {
  await rm(jobFolder(projectId), { recursive: true, force: true });
}
