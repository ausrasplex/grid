// The customer's side of a quote, on its private link (/q/<token>):
// view, choose extras, confirm by emailed code, sign or decline.
// Mounted at /api/public/quotes. Nobody is signed in here: the token is
// the only key, and it only ever opens the one revision it was made for.

import "server-only";
import { app, conflict, HttpError, notFound, type PublicRequest, type PublicRoutes, type RequestContext } from "@grid/core";
import { audit, db, readStoredFile, type Prisma } from "@grid/db";
import {
  assertOpen,
  checkCode,
  completeSignature,
  declineRequest,
  isExpired,
  isVerified,
  markViewed,
  maskEmail,
  requestByToken,
  sendCode,
  signedPdfFor,
  type Caller,
  type SignRequestRow,
} from "@grid/block-signatures";
import { formatMoney } from "./money";
import { makeJobFromQuote, renderQuotePdf, taxSettings } from "./service";
import { optionIndexes, totalsFor, type QuoteSnapshot } from "./snapshot";
import { publicCodeSchema, publicDeclineSchema, publicSignSchema } from "./validation";

const MOD = "quotes";
const callerOf = (request: PublicRequest): Caller => ({ ip: request.ip, userAgent: request.userAgent });

/** Acting for the business when the customer's answer changes things (the job). */
function actingFor(userId: string, companyId: string): RequestContext {
  return { userId, companyId, permissions: new Set(), enabledBlocks: new Set(), solo: true };
}

async function load(token: string) {
  const signRequest = await requestByToken(token);
  if (signRequest.blockId !== MOD) throw notFound();
  const revision = await db.quoteRevision.findUnique({ where: { id: signRequest.revisionId }, include: { quote: true } });
  if (!revision || revision.quote.deletedAt) throw notFound();
  return { signRequest, revision, quote: revision.quote, snapshot: revision.snapshot as unknown as QuoteSnapshot };
}

/** Where a quote stands, for the customer. */
function stateOf(signRequest: SignRequestRow, quote: { status: string }) {
  if (signRequest.status === "SIGNED") return "signed" as const;
  if (signRequest.status === "DECLINED") return "declined" as const;
  if (quote.status === "WITHDRAWN") return "withdrawn" as const;
  if (signRequest.status === "REVOKED") return "replaced" as const;
  if (isExpired(signRequest)) return "expired" as const;
  return "open" as const;
}

/** Everything the customer page shows. Records the visit. */
export async function customerView(token: string, caller: Caller) {
  const { signRequest, revision, quote, snapshot } = await load(token);
  const state = stateOf(signRequest, quote);
  if (state === "open") {
    const first = await markViewed(signRequest, caller);
    if (first) {
      await db.quote.updateMany({ where: { id: quote.id, viewedAt: null }, data: { viewedAt: new Date() } });
      await db.quoteEvent.create({ data: { quoteId: quote.id, type: "VIEWED", note: `Opened by the customer (Rev ${revision.label})` } });
    }
  }
  const [{ themeFor }, settings] = await Promise.all([import("@grid/block-templates"), taxSettings(signRequest.companyId)]);
  const theme = await themeFor(signRequest.companyId);
  const details = (signRequest.details ?? {}) as { chosen?: number[] };
  return {
    token,
    state,
    business: { name: theme.companyName, logo: theme.logoDataUrl, accent: theme.accentColor, phone: theme.phone, email: theme.email || snapshot.preparedBy.email },
    snapshot,
    revision: revision.label,
    codeTo: maskEmail(signRequest.recipientEmail),
    verified: state === "open" && isVerified(signRequest),
    allowDrawn: settings.signDrawn || !settings.signTyped,
    allowTyped: settings.signTyped,
    signed: signRequest.status === "SIGNED" ? { name: signRequest.signerName!, at: signRequest.signedAt!, verifyCode: signRequest.verifyCode!, chosen: details.chosen ?? [] } : null,
    declined: signRequest.status === "DECLINED" ? { at: signRequest.declinedAt! } : null,
  };
}

export type CustomerView = Awaited<ReturnType<typeof customerView>>;

async function emailBusiness(quoteId: string, sentById: string, subject: string, text: string, attachment?: { filename: string; content: Uint8Array }) {
  const user = await db.user.findUnique({ where: { id: sentById }, select: { email: true } });
  if (!user) return;
  await app()
    .mail.send({ to: user.email, subject, text, attachments: attachment ? [{ ...attachment, contentType: "application/pdf" }] : undefined })
    .catch((error) => console.error(`[quotes] couldn't email ${user.email} about ${quoteId}`, error));
}

const appUrl = (path: string) => `${(process.env.BETTER_AUTH_URL || "").replace(/\/$/, "")}${path}`;

async function sign(token: string, body: unknown, caller: Caller) {
  const input = publicSignSchema.parse(body);
  const { signRequest, revision, quote, snapshot } = await load(token);
  assertOpen(signRequest);
  if (quote.status !== "SENT" || quote.currentRevisionId !== revision.id) throw new HttpError(410, "gone", "This quote has changed. Check your email for the latest version.");

  const allowed = new Set(optionIndexes(snapshot));
  const chosen = [...new Set(input.chosen)].filter((index) => allowed.has(index)).sort((first, second) => first - second);
  const totals = totalsFor(snapshot, chosen);
  const settings = await taxSettings(signRequest.companyId);
  if (input.method === "DRAWN" && !settings.signDrawn && settings.signTyped) throw conflict("Type your name to sign.");
  if (input.method === "TYPED" && !settings.signTyped) throw conflict("Draw your signature to sign.");

  const docLabel = `${snapshot.tax.documentTitle} ${snapshot.number} Rev ${revision.label}`;
  const consents = [
    "I agree to sign this document electronically.",
    `I accept this ${snapshot.tax.documentTitle.toLowerCase()}, including its terms and the options I selected, for ${formatMoney(totals.totalCents, snapshot.tax.currency, snapshot.tax.locale)} incl. ${snapshot.tax.taxName}.`,
  ];
  const signed = await completeSignature(
    signRequest,
    {
      signerName: input.signerName,
      signerTitle: input.signerTitle,
      signerCompany: input.signerCompany,
      method: input.method,
      png: Buffer.from(input.signature.slice("data:image/png;base64,".length), "base64"),
      consents,
      details: { chosen, totalCents: totals.totalCents, revision: revision.label },
    },
    caller,
    docLabel,
    async ({ signatureDataUrl, certificate }) =>
      renderQuotePdf(signRequest.companyId, snapshot, false, {
        accepted: { signerName: input.signerName, signerTitle: input.signerTitle, signerCompany: input.signerCompany, signatureDataUrl, signedAt: certificate.signedAt, chosen },
        certificate,
      }),
  );

  // The quote is accepted; make the job (a failure here never loses the signature).
  const name = [input.signerName, input.signerCompany].filter(Boolean).join(", ");
  let projectId = quote.projectId;
  let jobNote: string | null = null;
  if (!projectId) {
    try {
      const client = quote.clientId ? await db.client.findUnique({ where: { id: quote.clientId }, select: { name: true } }) : null;
      projectId = await makeJobFromQuote(actingFor(revision.sentById, signRequest.companyId), { ...quote, client });
    } catch (error) {
      jobNote = (error as Error).message;
      console.error(`[quotes] signed ${quote.number} but couldn't make the job`, error);
    }
  }
  await db.$transaction(async (tx) => {
    await tx.quote.update({
      where: { id: quote.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: signed.signedAt,
        acceptedHow: "SIGNED_ONLINE",
        acceptedNote: `Signed online by ${name}`,
        acceptedOptions: chosen as Prisma.InputJsonValue,
        signRequestId: signRequest.id,
        projectId,
      },
    });
    await tx.quoteEvent.create({ data: { quoteId: quote.id, type: "ACCEPTED", note: `Signed online by ${name} (Rev ${revision.label})${chosen.length ? `, with ${chosen.length} extra${chosen.length === 1 ? "" : "s"}` : ""}` } });
    if (projectId && !quote.projectId) await tx.quoteEvent.create({ data: { quoteId: quote.id, type: "JOB_CREATED" } });
    if (jobNote) await tx.quoteEvent.create({ data: { quoteId: quote.id, type: "NOTE", note: `Couldn't make the job: ${jobNote}` } });
    await audit(tx, { blockId: MOD, actorId: null, companyId: signRequest.companyId, entityType: "Quote", entityId: quote.id, action: "accepted", diff: { how: "SIGNED_ONLINE", signer: name, chosen, projectId, verifyCode: signed.verifyCode } });
  });
  await app().events.emit("quotes.accepted", { quoteId: quote.id, projectId }, { emittedBy: MOD, companyId: signRequest.companyId, actorId: null });

  const filename = `${snapshot.number} signed.pdf`;
  const money = formatMoney(totals.totalCents, snapshot.tax.currency, snapshot.tax.locale);
  const theme = await (await import("@grid/block-templates")).themeFor(signRequest.companyId);
  await app()
    .mail.send({
      to: signRequest.recipientEmail,
      replyTo: theme.email || snapshot.preparedBy.email,
      subject: `Signed: ${snapshot.tax.documentTitle} ${snapshot.number} from ${theme.companyName}`,
      text: `Hi ${input.signerName},\n\nThanks for accepting ${snapshot.tax.documentTitle.toLowerCase()} ${snapshot.number} (${snapshot.title}) for ${money} incl. ${snapshot.tax.taxName}. Your signed copy is attached.\n\n${theme.companyName} will be in touch about the next steps.\n`,
      attachments: [{ filename, content: new Uint8Array(signed.signedPdf), contentType: "application/pdf" }],
    })
    .catch((error) => console.error("[quotes] couldn't email the signed copy to the customer", error));
  await emailBusiness(
    quote.id,
    revision.sentById,
    `Accepted: ${snapshot.number} ${snapshot.title} (${money})`,
    `${name} signed ${snapshot.tax.documentTitle.toLowerCase()} ${snapshot.number} Rev ${revision.label} online for ${money} incl. ${snapshot.tax.taxName}.\n` +
      (chosen.length ? `Extras chosen: ${chosen.map((index) => snapshot.lines[index]!.description).join("; ")}\n` : "") +
      (projectId && !quote.projectId ? `The job has been made.\n` : jobNote ? `The job couldn't be made: ${jobNote}\n` : "") +
      `\nOpen the quote: ${appUrl(`/b/quotes/${quote.id}`)}\nVerify code: ${signed.verifyCode}\n`,
    { filename, content: new Uint8Array(signed.signedPdf) },
  );
  return { signed: true, verifyCode: signed.verifyCode };
}

async function decline(token: string, body: unknown, caller: Caller) {
  const { reason } = publicDeclineSchema.parse(body ?? {});
  const { signRequest, revision, quote, snapshot } = await load(token);
  assertOpen(signRequest);
  if (quote.status !== "SENT" || quote.currentRevisionId !== revision.id) throw new HttpError(410, "gone", "This quote has changed. Check your email for the latest version.");
  await declineRequest(signRequest, reason ?? null, caller);
  await db.$transaction(async (tx) => {
    await tx.quote.update({ where: { id: quote.id }, data: { status: "DECLINED", declinedAt: new Date(), declineReason: reason ?? null } });
    await tx.quoteEvent.create({ data: { quoteId: quote.id, type: "DECLINED", note: `Declined online by the customer${reason ? `: ${reason}` : ""}` } });
  });
  await emailBusiness(
    quote.id,
    revision.sentById,
    `Declined: ${snapshot.number} ${snapshot.title}`,
    `The customer declined ${snapshot.tax.documentTitle.toLowerCase()} ${snapshot.number} Rev ${revision.label} online.\n${reason ? `Reason: ${reason}\n` : ""}\nOpen the quote: ${appUrl(`/b/quotes/${quote.id}`)}\n`,
  );
  return { declined: true };
}

const pdf = (data: Buffer, filename: string) =>
  new Response(new Uint8Array(data), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${filename.replace(/[^\w.\- ]/g, "")}"`, "cache-control": "private, no-store" },
  });

export const publicRoutes: PublicRoutes = {
  "GET /q/:token/pdf": {
    handler: async (request) => {
      const { signRequest, revision, snapshot } = await load(request.params.token!);
      if (request.query.get("signed") === "1") return pdf(await readStoredFile(await signedPdfFor(signRequest)), `${snapshot.number} signed.pdf`);
      if (!revision.pdfFileId) throw notFound();
      const file = await db.storedFile.findUniqueOrThrow({ where: { id: revision.pdfFileId } });
      return pdf(await readStoredFile(file), `${snapshot.number} Rev ${revision.label}.pdf`);
    },
  },
  "POST /q/:token/code": {
    handler: async (request) => {
      const { signRequest, snapshot } = await load(request.params.token!);
      const theme = await (await import("@grid/block-templates")).themeFor(signRequest.companyId);
      return sendCode(signRequest, callerOf(request), { what: `${snapshot.tax.documentTitle.toLowerCase()} ${snapshot.number}`, from: theme.companyName });
    },
  },
  "POST /q/:token/verify": {
    handler: async (request) => {
      const { signRequest } = await load(request.params.token!);
      return checkCode(signRequest, publicCodeSchema.parse(request.body).code, callerOf(request));
    },
  },
  "POST /q/:token/sign": { maxBytes: 600_000, handler: async (request) => sign(request.params.token!, request.body, callerOf(request)) },
  "POST /q/:token/decline": { handler: async (request) => decline(request.params.token!, request.body, callerOf(request)) },
};
