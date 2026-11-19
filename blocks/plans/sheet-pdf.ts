// Plan PDFs with layers drawn on (docs/plans-block.md "Plan PDFs"): for the
// viewer's Download PDF and a shared link's download.
//
// Built from the ORIGINAL upload, never the zoom tiles: the sheet's page is
// copied straight out of the uploaded PDF (still sharp at any zoom, text
// still searchable), or an uploaded image becomes the page. The chosen
// layers (markups, measurements, icons, from each Block's `planDrawing`)
// are drawn by Chromium as a see-through page the same size, which is laid
// exactly over the drawing, turned to match the page's own rotation.

import "server-only";
import { app, type PlanDrawingInput, type RequestContext } from "@grid/core";
import { db, readStoredFile } from "@grid/db";
import { normaliseRotation, overlayPlacement } from "./placement";

/** Image plans: pixels per inch for the page size (a photo of a plan has no real size). */
const IMAGE_DPI = 150;

export interface SheetForPdf {
  companyId: string;
  projectId: string;
  sheetId: string;
  number: string;
  title: string;
  version: { id: string; revision: string; fileId: string; page: number; widthPx: number | null; heightPx: number | null };
  versions: { id: string; revision: string; createdAt: Date }[];
}

/** Blocks the business has on (the same rule events use). */
async function enabledBlocks(companyId: string) {
  const registry = app().registry;
  const rows = await db.companyBlock.findMany({ where: { companyId, enabled: true }, select: { blockId: true } });
  return registry.effectiveEnabled(rows.map((row) => row.blockId));
}

/** Every Block's drawing for a sheet's revision, on the chosen layers (SVG in sheet units). */
export async function sheetDrawing(sheet: Omit<SheetForPdf, "number" | "title">, layers: { layerIds: string[]; withDefault: boolean; viewer?: RequestContext }): Promise<string> {
  const enabled = await enabledBlocks(sheet.companyId);
  const input: PlanDrawingInput = {
    companyId: sheet.companyId,
    projectId: sheet.projectId,
    sheetId: sheet.sheetId,
    versionId: sheet.version.id,
    versions: sheet.versions,
    layerIds: layers.layerIds,
    withDefault: layers.withDefault,
    viewer: layers.viewer,
  };
  const parts: string[] = [];
  for (const block of app().registry.blocks) {
    if (!block.planDrawing || (!block.required && !enabled.has(block.id))) continue;
    try {
      parts.push(await (await block.planDrawing())(input));
    } catch (error) {
      console.error(`[plans] ${block.id} couldn't draw on sheet ${sheet.sheetId}`, error);
    }
  }
  return parts.join("");
}

/** The see-through page of markups, `widthPt` × `heightPt`, drawn by Chromium. */
async function drawingPage(svg: string, aspect: number, widthPt: number, heightPt: number): Promise<Uint8Array> {
  const { renderPdf } = await import("@grid/block-templates");
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${widthPt / 72}in ${heightPt / 72}in;margin:0}html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body>` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${widthPt / 72}in" height="${heightPt / 72}in" viewBox="0 0 1 ${aspect}" preserveAspectRatio="none">${svg}</svg>` +
    `</body></html>`;
  return new Uint8Array(await renderPdf(html, { page: { widthIn: widthPt / 72, heightIn: heightPt / 72 } }));
}

/**
 * One PDF of the sheets given, in order, each with its drawing (SVG from
 * sheetDrawing, or "" for a clean sheet).
 */
export async function buildPlanPdf(sheets: { sheet: SheetForPdf; svg: string }[]): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const out = await PDFDocument.create();
  out.setTitle(sheets.length === 1 ? `${sheets[0]!.sheet.number} ${sheets[0]!.sheet.title}`.trim() : "Plans");
  out.setProducer("Grid");
  const sources = new Map<string, Awaited<ReturnType<typeof PDFDocument.load>>>();

  for (const { sheet, svg } of sheets) {
    const file = await db.storedFile.findUniqueOrThrow({ where: { id: sheet.version.fileId } });
    const bytes = await readStoredFile(file);
    let page;
    if (file.mime === "application/pdf") {
      let source = sources.get(file.id);
      if (!source) {
        source = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
        sources.set(file.id, source);
      }
      [page] = await out.copyPages(source, [sheet.version.page - 1]);
      page = out.addPage(page!);
      // The tiles (what people drew on) are drawn from the whole media box, so show all of it.
      const media = page.getMediaBox();
      page.setCropBox(media.x, media.y, media.width, media.height);
    } else {
      // An image: turned upright as the tiles were, then one page the image's size.
      const sharp = (await import("sharp")).default;
      const upright = await sharp(bytes, { limitInputPixels: false }).rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
      const image = await out.embedJpg(upright.data);
      const widthPt = (upright.info.width / IMAGE_DPI) * 72;
      const heightPt = (upright.info.height / IMAGE_DPI) * 72;
      page = out.addPage([widthPt, heightPt]);
      page.drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt });
    }
    if (!svg) continue;

    // The page as it's seen (after its rotation), which is how the tiles were drawn.
    const box = page.getMediaBox();
    // Laid over the page, turned to undo the page's rotation (placement.ts, tested).
    const placement = overlayPlacement(box, normaliseRotation(page.getRotation().angle));
    const aspect = sheet.version.widthPx && sheet.version.heightPx ? sheet.version.heightPx / sheet.version.widthPx : placement.height / placement.width;
    const [overlay] = await out.embedPdf(await drawingPage(svg, aspect, placement.width, placement.height));
    page.drawPage(overlay!, { ...placement, rotate: degrees(placement.rotate) });
  }
  return out.save();
}

/** A PDF download response. */
export function pdfResponse(bytes: Uint8Array, filename: string) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename.replace(/[^\w.\- ]/g, "").trim() || "Plans"}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
