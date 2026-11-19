// Sharing plans by private link (docs/plans-block.md "Sharing plans"), and
// the viewer's Download PDF.
//
// A link (/s/<token>) shows the sheets chosen when it was made, always at
// each sheet's current revision, with the markups and icons on the chosen
// layers drawn on (never "Just me" ones; photo pins never). Nobody signs in:
// the token is the only key. It stops working when it runs out, when it's
// turned off, when a sheet is deleted (that sheet drops out), and while the
// job is archived or deleted or the business has Plans off.
//
// The token is stored hashed (to find it) and encrypted (so the link can be
// shown and copied again later), like invite links.

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { app, badRequest, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, decryptSecret, encryptSecret } from "@grid/db";
import { canSeeJob } from "@grid/block-projects";
import { buildPlanPdf, pdfResponse, sheetDrawing, type SheetForPdf } from "./sheet-pdf";
import { sheetForOverlay, sortSheets } from "./service";
import type { ShareInput } from "./validation";

const MOD = "plans";
const DAY = 86_400_000;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const shareLink = (token: string) => `/s/${token}`;

// ---------------------------------------------------------------------
// Making and managing links (signed in, plans.share)
// ---------------------------------------------------------------------

async function jobOrThrow(ctx: RequestContext, projectId: string) {
  if (!(await canSeeJob(ctx, projectId))) throw notFound("Job not found");
}

export interface ShareView {
  id: string;
  name: string;
  link: string;
  sheets: { id: string; number: string }[];
  /** Layer names shown, Default first if it's one. */
  layers: string[];
  allowDownload: boolean;
  expiresAt: Date | null;
  state: "on" | "expired" | "off";
  createdBy: string;
  createdAt: Date;
  lastOpenedAt: Date | null;
  openCount: number;
}

/** The job's share links, newest first (turned-off ones too, for a while: 90 days). */
export async function listShares(ctx: RequestContext, projectId: string): Promise<ShareView[]> {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  const rows = await db.planShare.findMany({
    where: { companyId, projectId, OR: [{ revokedAt: null }, { revokedAt: { gt: new Date(Date.now() - 90 * DAY) } }] },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const sheetIds = [...new Set(rows.flatMap((row) => row.sheetIds as string[]))];
  const layerIds = [...new Set(rows.flatMap((row) => row.layerIds as string[]))];
  const [sheets, layers, users] = await Promise.all([
    db.planSheet.findMany({ where: { id: { in: sheetIds }, companyId, deletedAt: null }, select: { id: true, number: true } }),
    db.planLayer.findMany({ where: { id: { in: layerIds }, companyId, deletedAt: null }, select: { id: true, name: true } }),
    db.user.findMany({ where: { id: { in: rows.map((row) => row.createdById) } }, select: { id: true, name: true } }),
  ]);
  const sheetById = new Map(sheets.map((sheet) => [sheet.id, sheet]));
  const layerName = new Map(layers.map((layer) => [layer.id, layer.name]));
  const who = new Map(users.map((user) => [user.id, user.name]));
  const now = Date.now();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    link: shareLink(decryptSecret(row.tokenEnc)),
    sheets: (row.sheetIds as string[]).flatMap((id) => (sheetById.has(id) ? [sheetById.get(id)!] : [])),
    layers: [...(row.withDefault ? ["Default"] : []), ...new Set((row.layerIds as string[]).flatMap((id) => (layerName.has(id) ? [layerName.get(id)!] : [])))],
    allowDownload: row.allowDownload,
    expiresAt: row.expiresAt,
    state: row.revokedAt ? "off" : row.expiresAt && row.expiresAt.getTime() <= now ? "expired" : "on",
    createdBy: who.get(row.createdById) ?? "Someone",
    createdAt: row.createdAt,
    lastOpenedAt: row.lastOpenedAt,
    openCount: row.openCount,
  }));
}

/** Every layer on the job's sheets, for picking which to share or download. */
export async function jobLayers(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  const rows = await db.planLayer.findMany({
    where: { companyId, deletedAt: null, sheetId: { in: (await db.planSheet.findMany({ where: { companyId, projectId, deletedAt: null }, select: { id: true } })).map((sheet) => sheet.id) } },
    orderBy: { createdAt: "asc" },
    select: { id: true, sheetId: true, name: true },
  });
  return rows;
}

export async function createShare(ctx: RequestContext, projectId: string, input: ShareInput) {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  const sheets = await db.planSheet.findMany({ where: { id: { in: input.sheetIds }, companyId, projectId, deletedAt: null }, select: { id: true, number: true } });
  if (sheets.length !== new Set(input.sheetIds).size) throw badRequest("One of those sheets isn't on this job any more");
  // Layers are per sheet: keep the ones on the chosen sheets.
  const layers = input.layerIds.length
    ? await db.planLayer.findMany({ where: { id: { in: input.layerIds }, companyId, deletedAt: null, sheetId: { in: input.sheetIds } }, select: { id: true } })
    : [];
  const token = randomBytes(24).toString("base64url");
  const expiresAt = input.days ? new Date(Date.now() + input.days * DAY) : null;
  const share = await db.$transaction(async (tx) => {
    const share = await tx.planShare.create({
      data: {
        companyId,
        projectId,
        name: input.name,
        tokenHash: hashToken(token),
        tokenEnc: encryptSecret(token),
        sheetIds: [...new Set(input.sheetIds)],
        layerIds: layers.map((layer) => layer.id),
        withDefault: input.withDefault,
        allowDownload: input.allowDownload,
        expiresAt,
        createdById: ctx.userId,
      },
    });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      projectId,
      entityType: "PlanShare",
      entityId: share.id,
      action: "created",
      diff: { name: input.name, sheets: sheets.map((sheet) => sheet.number), layers: layers.length + (input.withDefault ? 1 : 0), download: input.allowDownload, expiresAt },
    });
    return share;
  });
  return { id: share.id, link: shareLink(token) };
}

/** Turn a link off for good (make a new one to share again). */
export async function revokeShare(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const share = await db.planShare.findFirst({ where: { id, companyId } });
  if (!share) throw notFound("Link not found");
  await jobOrThrow(ctx, share.projectId);
  if (share.revokedAt) return { id, revoked: true };
  await db.$transaction(async (tx) => {
    await tx.planShare.update({ where: { id }, data: { revokedAt: new Date(), revokedById: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId: share.projectId, entityType: "PlanShare", entityId: id, action: "turned_off", diff: { name: share.name } });
  });
  return { id, revoked: true };
}

// ---------------------------------------------------------------------
// The viewer's Download PDF (signed in, plans.view)
// ---------------------------------------------------------------------

async function sheetForPdf(sheetId: string, companyId: string, versionId?: string | null): Promise<SheetForPdf | null> {
  const sheet = await db.planSheet.findFirst({ where: { id: sheetId, companyId, deletedAt: null }, include: { versions: { orderBy: { createdAt: "desc" } } } });
  if (!sheet) return null;
  const version = sheet.versions.find((entry) => entry.id === (versionId || sheet.currentVersionId)) ?? sheet.versions[0];
  if (!version) return null;
  return {
    companyId,
    projectId: sheet.projectId,
    sheetId: sheet.id,
    number: sheet.number,
    title: sheet.title,
    version: { id: version.id, revision: version.revision, fileId: version.fileId, page: version.page, widthPx: version.widthPx, heightPx: version.heightPx },
    versions: sheet.versions.map((entry) => ({ id: entry.id, revision: entry.revision, createdAt: entry.createdAt })),
  };
}

const fileName = (sheet: SheetForPdf) => [sheet.number, sheet.title, sheet.version.revision ? `Rev ${sheet.version.revision}` : ""].filter(Boolean).join(" ");

/** One sheet's revision as a PDF, with the chosen layers drawn on. */
export async function downloadSheetPdf(ctx: RequestContext, sheetId: string, options: { versionId: string | null; layerIds: string[]; withDefault: boolean }) {
  const overlay = await sheetForOverlay(ctx, sheetId);
  const sheet = await sheetForPdf(overlay.id, overlay.companyId, options.versionId);
  if (!sheet) throw notFound("Sheet not found");
  const svg = await sheetDrawing(sheet, { layerIds: options.layerIds, withDefault: options.withDefault, viewer: ctx });
  return pdfResponse(await buildPlanPdf([{ sheet, svg }]), fileName(sheet));
}

// ---------------------------------------------------------------------
// The link itself (nobody signed in)
// ---------------------------------------------------------------------

/** The share behind a token, if it still works. Anything wrong is the same 404. */
async function liveShare(token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) throw notFound();
  const share = await db.planShare.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!share || share.revokedAt || (share.expiresAt && share.expiresAt.getTime() <= Date.now())) throw notFound();
  const [project, company, blocks] = await Promise.all([
    db.project.findUnique({ where: { id: share.projectId }, select: { name: true, deletedAt: true, archivedAt: true } }),
    db.company.findUnique({ where: { id: share.companyId }, select: { name: true, deletedAt: true } }),
    db.companyBlock.findMany({ where: { companyId: share.companyId, enabled: true }, select: { blockId: true } }),
  ]);
  if (!project || project.deletedAt || project.archivedAt || !company || company.deletedAt) throw notFound();
  if (!app().registry.effectiveEnabled(blocks.map((row) => row.blockId)).has(MOD)) throw notFound();
  return { share, project, company };
}

/** A sheet on the link, at its current revision. */
async function sharedSheet(token: string, sheetId: string) {
  const { share } = await liveShare(token);
  if (!(share.sheetIds as string[]).includes(sheetId)) throw notFound();
  const sheet = await sheetForPdf(sheetId, share.companyId);
  if (!sheet || sheet.projectId !== share.projectId) throw notFound();
  return { share, sheet };
}

export interface SharedPlansView {
  token: string;
  business: string;
  job: string;
  name: string;
  allowDownload: boolean;
  expiresAt: Date | null;
  sheets: {
    id: string;
    number: string;
    title: string;
    revision: string;
    revisionDate: Date;
    versionId: string;
    widthPx: number | null;
    heightPx: number | null;
    ready: boolean;
  }[];
}

/** What the link's page shows. Counts the visit. */
export async function openSharedPlans(token: string): Promise<SharedPlansView> {
  const { share, project, company } = await liveShare(token);
  const rows = await db.planSheet.findMany({
    where: { id: { in: share.sheetIds as string[] }, companyId: share.companyId, projectId: share.projectId, deletedAt: null },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });
  await db.planShare.update({ where: { id: share.id }, data: { lastOpenedAt: new Date(), openCount: { increment: 1 } } });
  const sheets = sortSheets(rows).flatMap((sheet) => {
    const version = sheet.versions.find((entry) => entry.id === sheet.currentVersionId) ?? sheet.versions[0];
    if (!version) return [];
    return [
      {
        id: sheet.id,
        number: sheet.number,
        title: sheet.title,
        revision: version.revision,
        revisionDate: version.createdAt,
        versionId: version.id,
        widthPx: version.widthPx,
        heightPx: version.heightPx,
        ready: version.status === "READY" && !version.tilesDroppedAt,
      },
    ];
  });
  return { token, business: company.name, job: project.name, name: share.name, allowDownload: share.allowDownload, expiresAt: share.expiresAt, sheets };
}

/** The drawing on a shared sheet (SVG in sheet units). */
export async function sharedDrawing(token: string, sheetId: string) {
  const { share, sheet } = await sharedSheet(token, sheetId);
  return { versionId: sheet.version.id, svg: await sheetDrawing(sheet, { layerIds: share.layerIds as string[], withDefault: share.withDefault }) };
}

/** Remembers for a minute which tiles a link may load (a view loads dozens). */
const tilesSeen = new Map<string, number>();

/** A tile of a shared sheet's current revision. */
export async function sharedTileVersion(token: string, sheetId: string, versionId: string) {
  const key = `${hashToken(token)}:${sheetId}:${versionId}`;
  if ((tilesSeen.get(key) ?? 0) > Date.now()) return versionId;
  const { sheet } = await sharedSheet(token, sheetId);
  // Only the revision the link shows.
  if (sheet.version.id !== versionId) throw notFound();
  if (tilesSeen.size > 5000) tilesSeen.clear();
  tilesSeen.set(key, Date.now() + 60_000);
  return versionId;
}

/** Download: one sheet, or every sheet on the link (sheetId null). */
export async function sharedPdf(token: string, sheetId: string | null) {
  const { share } = await liveShare(token);
  if (!share.allowDownload) throw notFound();
  const ids = sheetId ? [sheetId] : (share.sheetIds as string[]);
  const sheets: { sheet: SheetForPdf; svg: string }[] = [];
  for (const id of ids) {
    if (!(share.sheetIds as string[]).includes(id)) throw notFound();
    const sheet = await sheetForPdf(id, share.companyId);
    if (!sheet || sheet.projectId !== share.projectId) {
      if (sheetId) throw notFound();
      continue;
    }
    sheets.push({ sheet, svg: await sheetDrawing(sheet, { layerIds: share.layerIds as string[], withDefault: share.withDefault }) });
  }
  if (!sheets.length) throw notFound();
  // In the order they were chosen (set order).
  return pdfResponse(await buildPlanPdf(sheets), sheetId ? fileName(sheets[0]!.sheet) : `${share.name} plans`);
}
