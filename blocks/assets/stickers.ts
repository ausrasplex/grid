// Printing asset tags (docs/assets-block.md §1): a PDF of stickers at the
// label sheet's exact size, one QR code per asset (its /go/<code> link),
// with the business's logo or name and the friendly number. The layout
// picked last, a Custom layout typed off the packet and the "Move
// everything" nudge are kept for the business. A test page draws each
// label's outline, to print on plain paper and hold against the sheet.

import "server-only";
import { badRequest, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, routeCodeUrl, type Prisma } from "@grid/db";
import { customLayout, DEFAULT_LAYOUT, layoutById, layoutProblem, perPage, placeStickers, STICKER_LAYOUTS, type CustomLayoutInput, type StickerLayout } from "./sticker-layouts";
import type { Sticker } from "./sticker-document";
import { customLayoutSchema, type StickerQuery, type StickerSettingsInput } from "./validation";

const MOD = "assets";
const MM_PER_INCH = 25.4;

export interface StickerSettingsView {
  layout: string;
  custom: CustomLayoutInput | null;
  offsetX: number;
  offsetY: number;
  layouts: StickerLayout[];
}

export async function stickerSettings(ctx: RequestContext): Promise<StickerSettingsView> {
  const row = await db.assetSettings.findUnique({ where: { companyId: requireCompany(ctx) } });
  const custom = row?.stickerCustom ? customLayoutSchema.safeParse(row.stickerCustom) : null;
  return { layout: row?.stickerLayout ?? DEFAULT_LAYOUT, custom: custom?.success ? custom.data : null, offsetX: row?.stickerOffsetX ?? 0, offsetY: row?.stickerOffsetY ?? 0, layouts: STICKER_LAYOUTS };
}

export async function saveStickerSettings(ctx: RequestContext, input: StickerSettingsInput): Promise<StickerSettingsView> {
  const companyId = requireCompany(ctx);
  if (input.layout === "custom") {
    if (!input.custom) throw badRequest("Type in the label sizes from the packet");
    const problem = layoutProblem(customLayout(input.custom));
    if (problem) throw badRequest(problem);
  } else if (!STICKER_LAYOUTS.some((layout) => layout.id === input.layout)) throw badRequest("Pick a layout");
  const data = {
    stickerLayout: input.layout,
    ...(input.custom ? { stickerCustom: input.custom as unknown as Prisma.InputJsonValue } : {}),
    stickerOffsetX: input.offsetX,
    stickerOffsetY: input.offsetY,
  };
  await db.$transaction(async (tx) => {
    await tx.assetSettings.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetSettings", entityId: companyId, action: "updated", diff: { stickers: input.layout, custom: input.custom ?? undefined, offset: [input.offsetX, input.offsetY] } });
  });
  return stickerSettings(ctx);
}

/** The business's layout by id, its Custom one included. */
async function layoutFor(ctx: RequestContext, id: string) {
  const settings = await stickerSettings(ctx);
  const layout = layoutById(id, settings.custom ? customLayout(settings.custom) : null);
  if (id === "custom" && layout.id !== "custom") throw badRequest("Set up the Custom layout first");
  return { layout, offset: { x: settings.offsetX, y: settings.offsetY } };
}

async function render(companyId: string, layout: StickerLayout, placed: ReturnType<typeof placeStickers<Sticker>>, outline: boolean) {
  const [{ themeFor, renderPdf, toHtml }, { StickerDocument }, { createElement }] = await Promise.all([import("@grid/block-templates"), import("./sticker-document"), import("react")]);
  const theme = await themeFor(companyId);
  const html = await toHtml(createElement(StickerDocument, { layout, placed, owner: theme.companyName, logoDataUrl: theme.logoDataUrl, outline }));
  return renderPdf(html, { sheet: { widthIn: layout.page.width / MM_PER_INCH, heightIn: layout.page.height / MM_PER_INCH } });
}

const pdfResponse = (pdf: Buffer, filename: string) =>
  new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "private, no-store" } });

export async function stickerPdf(ctx: RequestContext, query: StickerQuery) {
  const companyId = requireCompany(ctx);
  const ids = [...new Set(query.ids.split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 2000);
  const rows = await db.asset.findMany({ where: { companyId, deletedAt: null, id: { in: ids } }, orderBy: { number: "asc" }, select: { number: true, name: true, tagCode: true } });
  if (!rows.length) throw badRequest("Pick the assets to print tags for");
  const { layout, offset } = await layoutFor(ctx, query.layout);
  const { toString } = await import("qrcode");
  const stickers: Sticker[] = [];
  for (const row of rows) {
    // M: still reads with a scuffed corner, without making the code too dense for a small sticker.
    const qrSvg = await toString(routeCodeUrl(row.tagCode), { type: "svg", margin: 0, errorCorrectionLevel: "M" });
    stickers.push({ number: row.number, name: row.name, code: row.tagCode, qrSvg });
  }
  const pdf = await render(companyId, layout, placeStickers(layout, stickers, query.start, offset), false);
  // The layout used is the one offered first next time.
  await db.assetSettings.upsert({ where: { companyId }, create: { companyId, stickerLayout: layout.id }, update: { stickerLayout: layout.id } });
  return pdfResponse(pdf, rows.length === 1 ? `Asset tag ${rows[0]!.number}.pdf` : `Asset tags (${rows.length}).pdf`);
}

/** One sheet with every label's outline and position number: print it on plain paper and hold it against the label sheet. */
export async function testSheet(ctx: RequestContext, layoutId: string) {
  const companyId = requireCompany(ctx);
  const { layout, offset } = await layoutFor(ctx, layoutId);
  const blanks: Sticker[] = Array.from({ length: perPage(layout) }, (_, index) => ({ number: index + 1, name: "", code: `space-${index + 1}`, qrSvg: "" }));
  const pdf = await render(companyId, layout, placeStickers(layout, blanks, 1, offset), true);
  return pdfResponse(pdf, "Sticker test page.pdf");
}

/** One asset's QR code as SVG, for its page. */
export async function tagSvg(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const row = await db.asset.findFirst({ where: { id, companyId, deletedAt: null }, select: { tagCode: true } });
  if (!row) return null;
  const { toString } = await import("qrcode");
  return toString(routeCodeUrl(row.tagCode), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
