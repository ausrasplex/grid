// The client's handover link (docs/materials-block.md "The client's link"):
// /h/<token> shows the job's handover list on a page that suits a phone,
// with Download PDF. Nobody signs in: the token is the only key. It always
// shows the current list, keeps working after the job is archived, and
// stops when it's turned off or runs out, when the job or business is
// deleted, or when the business turns Handover off.
//
// One link per job at a time. The token is stored hashed (to find it) and
// encrypted (so the link can be shown and copied again later).

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { app, badRequest, conflict, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, decryptSecret, encryptSecret, openStoredFile } from "@grid/db";
import { canSeeJob, getProject } from "@grid/block-projects";
import { getClient } from "@grid/block-clients";
import { publicUrl } from "@grid/block-signatures";
import { cachedSchedule, pdfResponse, scheduleModel, type ScheduleModel } from "./pdf";
import type { EmailInput, ShareInput } from "./validation";

const MOD = "handover";
const DAY = 86_400_000;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const shareLink = (token: string) => `/h/${token}`;

async function jobOrThrow(ctx: RequestContext, projectId: string) {
  if (!(await canSeeJob(ctx, projectId))) throw notFound("Job not found");
}

export interface ShareView {
  id: string;
  link: string;
  expiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
  lastOpenedAt: Date | null;
  openCount: number;
}

const isLive = (share: { revokedAt: Date | null; expiresAt: Date | null }) => !share.revokedAt && (!share.expiresAt || share.expiresAt.getTime() > Date.now());

/** The job's link that's working now, if there is one. */
export async function currentShare(ctx: RequestContext, projectId: string): Promise<ShareView | null> {
  const companyId = requireCompany(ctx);
  await jobOrThrow(ctx, projectId);
  const rows = await db.handoverShare.findMany({ where: { companyId, projectId, revokedAt: null }, orderBy: { createdAt: "desc" }, take: 5 });
  const share = rows.find(isLive);
  if (!share) return null;
  const user = await db.user.findUnique({ where: { id: share.createdById }, select: { name: true } });
  return {
    id: share.id,
    link: shareLink(decryptSecret(share.tokenEnc)),
    expiresAt: share.expiresAt,
    createdBy: user?.name ?? "Someone",
    createdAt: share.createdAt,
    lastOpenedAt: share.lastOpenedAt,
    openCount: share.openCount,
  };
}

export async function createShare(ctx: RequestContext, projectId: string, input: ShareInput): Promise<ShareView> {
  const companyId = requireCompany(ctx);
  const job = await getProject(ctx, projectId);
  if (await currentShare(ctx, projectId)) throw conflict("This job already has a link. Turn it off first to make a new one.");
  const token = randomBytes(24).toString("base64url");
  const expiresAt = input.days ? new Date(Date.now() + input.days * DAY) : null;
  await db.$transaction(async (tx) => {
    const share = await tx.handoverShare.create({
      data: { companyId, projectId, tokenHash: hashToken(token), tokenEnc: encryptSecret(token), clientId: job.clientId, expiresAt, createdById: ctx.userId },
    });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId, entityType: "HandoverShare", entityId: share.id, action: "created", diff: { expiresAt } });
  });
  return (await currentShare(ctx, projectId))!;
}

/** Turn the link off for good (make a new one to share again). */
export async function revokeShare(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const share = await db.handoverShare.findFirst({ where: { id, companyId } });
  if (!share) throw notFound("Link not found");
  await jobOrThrow(ctx, share.projectId);
  if (share.revokedAt) return { id, revoked: true };
  await db.$transaction(async (tx) => {
    await tx.handoverShare.update({ where: { id }, data: { revokedAt: new Date(), revokedById: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId: share.projectId, entityType: "HandoverShare", entityId: id, action: "turned_off", diff: {} });
  });
  return { id, revoked: true };
}

/** The client's email address, for the Email box. */
export async function clientEmail(ctx: RequestContext, projectId: string) {
  const job = await getProject(ctx, projectId);
  const client = job.clientId ? await getClient(ctx, job.clientId) : null;
  return { email: client?.email ?? null, name: client?.contactName || client?.name || null };
}

/** Email to client: the link (made now if there isn't one) and the PDF attached. */
export async function emailShare(ctx: RequestContext, projectId: string, input: EmailInput) {
  const companyId = requireCompany(ctx);
  if (!(await app().mail.configured())) throw badRequest("Email isn't set up on this server yet (Settings › Email). Copy the link and send it yourself.");
  const share = (await currentShare(ctx, projectId)) ?? (await createShare(ctx, projectId, { days: null }));
  const [{ pdf, filename, model }, client, sender, company] = await Promise.all([
    cachedSchedule(companyId, projectId),
    clientEmail(ctx, projectId),
    db.user.findUnique({ where: { id: ctx.userId }, select: { name: true, email: true } }),
    db.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);
  await app().mail.send({
    to: input.to,
    replyTo: sender?.email ?? undefined,
    subject: `${model.title}: ${model.jobName}`,
    text:
      `Hi ${client.name ?? "there"},\n\n` +
      (input.message ? `${input.message}\n\n` : `Here's the handover sheet for ${model.jobName}: what's installed, room by room, with brands, finishes and links.\n\n`) +
      `See it any time, or download it again:\n${publicUrl(share.link)}\n\n` +
      `The PDF is attached too.\n\n${sender?.name ?? ""}\n${company?.name ?? ""}`.trim(),
    attachments: [{ filename, content: new Uint8Array(pdf), contentType: "application/pdf" }],
  });
  await db.$transaction(async (tx) => {
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId, entityType: "HandoverShare", entityId: share.id, action: "emailed", diff: { to: input.to } });
  });
  return { sent: true, link: share.link };
}

// ---------------------------------------------------------------------
// The link itself (nobody signed in)
// ---------------------------------------------------------------------

/** The share behind a token, if it still works. Anything wrong is the same 404. */
async function liveShare(token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) throw notFound();
  const share = await db.handoverShare.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!share || !isLive(share)) throw notFound();
  const [project, company, blocks] = await Promise.all([
    // Archived jobs still work: clients look things up years later.
    db.project.findUnique({ where: { id: share.projectId }, select: { deletedAt: true } }),
    db.company.findUnique({ where: { id: share.companyId }, select: { deletedAt: true } }),
    db.companyBlock.findMany({ where: { companyId: share.companyId, enabled: true }, select: { blockId: true } }),
  ]);
  if (!project || project.deletedAt || !company || company.deletedAt) throw notFound();
  if (!app().registry.effectiveEnabled(blocks.map((row) => row.blockId)).has(MOD)) throw notFound();
  return share;
}

export interface SharedHandoverView {
  token: string;
  business: { name: string; phone: string | null; email: string | null; website: string | null; hasLogo: boolean };
  model: ScheduleModel;
  /** When the list last changed. */
  updatedAt: Date | null;
}

/** What the link's page shows. Counts the visit. */
export async function openShared(token: string): Promise<SharedHandoverView> {
  const share = await liveShare(token);
  const [model, company, theme, lastLine, settings] = await Promise.all([
    scheduleModel(share.companyId, share.projectId),
    db.company.findUniqueOrThrow({ where: { id: share.companyId }, select: { name: true } }),
    db.docTheme.findUnique({ where: { companyId: share.companyId } }),
    db.handoverItem.findFirst({ where: { projectId: share.projectId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    db.handoverSettings.findUnique({ where: { projectId: share.projectId }, select: { updatedAt: true } }),
  ]);
  await db.handoverShare.update({ where: { id: share.id }, data: { lastOpenedAt: new Date(), openCount: { increment: 1 } } });
  const dates = [lastLine?.updatedAt, settings?.updatedAt].filter((date): date is Date => !!date);
  return {
    token,
    business: { name: company.name, phone: theme?.phone ?? null, email: theme?.email ?? null, website: theme?.website ?? null, hasLogo: !!theme?.logoFileId },
    model,
    updatedAt: dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null,
  };
}

export async function sharedPdf(token: string) {
  const share = await liveShare(token);
  const { pdf, filename } = await cachedSchedule(share.companyId, share.projectId);
  return pdfResponse(pdf, filename, true);
}

async function fileResponse(companyId: string, fileId: string, variant: "thumb" | "display" | "original") {
  const file = await db.storedFile.findFirst({ where: { id: fileId, companyId, purgedAt: null } });
  if (!file) throw notFound();
  const { stream, size, mime } = await openStoredFile(file, variant).catch(() => {
    throw notFound();
  });
  const { Readable } = await import("node:stream");
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: { "content-type": mime, "content-length": String(size), "cache-control": "private, max-age=3600" },
  });
}

/** A picture on the link: a material on this job's list, or its cover. */
export async function sharedPicture(token: string, fileId: string, variant: "thumb" | "display") {
  const share = await liveShare(token);
  const [settings, items] = await Promise.all([
    db.handoverSettings.findUnique({ where: { projectId: share.projectId }, select: { coverFileId: true } }),
    db.handoverItem.findMany({ where: { projectId: share.projectId }, select: { materialId: true } }),
  ]);
  const onList =
    settings?.coverFileId === fileId ||
    (await db.material.count({ where: { companyId: share.companyId, photoFileId: fileId, id: { in: [...new Set(items.map((item) => item.materialId))] } } })) > 0;
  if (!onList) throw notFound();
  return fileResponse(share.companyId, fileId, variant);
}

export async function sharedLogo(token: string) {
  const share = await liveShare(token);
  const theme = await db.docTheme.findUnique({ where: { companyId: share.companyId }, select: { logoFileId: true } });
  if (!theme?.logoFileId) throw notFound();
  return fileResponse(share.companyId, theme.logoFileId, "original");
}
