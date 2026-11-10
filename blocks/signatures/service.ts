// The signatures core service (docs/quotations-block.md §6b). A block that
// wants something signed creates a SignRequest for one exact version of a
// document and sends the private link. This service handles the link,
// the one-time code, the audit trail, sealing the signed PDF and the
// verify page. The owning block renders its own document and decides
// what signing means (a quote becomes accepted, a job is made…).

import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { app, conflict, HttpError, notFound, type RequestContext } from "@grid/core";
import { db, decryptSecret, encryptSecret, saveGeneratedFile, type Prisma, type Tx } from "@grid/db";
import { sealInfo, sealPdf } from "./seal";

const MOD = "signatures";
const CODE_MINUTES = 10;
const CODE_TRIES = 5;
const CODES_PER_HOUR = 5;
/** How long a verified code lets someone finish signing. */
const VERIFIED_MINUTES = 60;

export interface Caller {
  ip: string;
  userAgent: string;
}

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const tooMany = (message: string) => new HttpError(429, "too_many", message);
const gone = (message: string) => new HttpError(410, "gone", message);

/** The public address for a path, e.g. "/q/<token>". */
export function publicUrl(path: string): string {
  const base = (process.env.PUBLIC_LINK_BASE || process.env.BETTER_AUTH_URL || "").replace(/\/$/, "");
  return `${base}${path}`;
}

/** "s•••h@example.com": enough for someone to recognise their own address. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  if (user.length <= 2) return `${user[0] ?? ""}•••@${domain}`;
  return `${user[0]}•••${user[user.length - 1]}@${domain}`;
}

const VERIFY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function newVerifyCode(): string {
  let code = "";
  for (let index = 0; index < 8; index++) code += VERIFY_ALPHABET[randomInt(VERIFY_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
export function normaliseVerifyCode(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return cleaned.length === 8 ? `${cleaned.slice(0, 4)}-${cleaned.slice(4)}` : cleaned;
}

// ---------------------------------------------------------------------
// For the owning block (signed-in side)
// ---------------------------------------------------------------------

export interface NewSignRequest {
  companyId: string;
  blockId: string;
  docType: string;
  refId: string;
  revisionId: string;
  recipientEmail: string;
  /** SHA-256 of the PDF the signer will be shown. */
  docSha256: string;
  expiresAt: Date;
  createdById: string;
}

/**
 * Makes the private link for one version of a document. Any earlier open
 * link for the same thing stops working (only the latest version can be signed).
 */
export async function createSignRequest(tx: Tx, input: NewSignRequest) {
  await revokeSignRequests(tx, input.blockId, input.refId, "A newer version was sent");
  const token = randomBytes(24).toString("base64url");
  const signRequest = await tx.signRequest.create({
    data: { ...input, tokenHash: sha256(token), tokenEnc: encryptSecret(token) },
  });
  return { id: signRequest.id, token, url: (path: string) => publicUrl(`${path}${token}`) };
}

/** Stops open links for a thing working (withdrawn, answered another way, new version). */
export async function revokeSignRequests(tx: Tx, blockId: string, refId: string, why: string) {
  const open = await tx.signRequest.findMany({ where: { blockId, refId, status: "OPEN" }, select: { id: true } });
  if (!open.length) return 0;
  await tx.signRequest.updateMany({ where: { id: { in: open.map((request) => request.id) } }, data: { status: "REVOKED", revokedAt: new Date() } });
  await tx.signatureEvent.createMany({ data: open.map((request) => ({ requestId: request.id, type: "REVOKED", data: { why } })) });
  return open.length;
}

/** The latest link for a thing, for the business's own screen ("Copy link"). */
export async function latestSignRequest(ctx: RequestContext, blockId: string, refId: string, linkPath: string) {
  const signRequest = await db.signRequest.findFirst({ where: { blockId, refId, companyId: ctx.companyId ?? "" }, orderBy: { createdAt: "desc" } });
  if (!signRequest) return null;
  return {
    id: signRequest.id,
    status: signRequest.status,
    url: signRequest.status === "OPEN" ? publicUrl(`${linkPath}${decryptSecret(signRequest.tokenEnc)}`) : null,
    recipientEmail: signRequest.recipientEmail,
    expiresAt: signRequest.expiresAt,
    viewedAt: signRequest.viewedAt,
    signedAt: signRequest.signedAt,
    signerName: signRequest.signerName,
    verifyCode: signRequest.verifyCode,
    signedPdfFileId: signRequest.signedPdfFileId,
  };
}

/** The audit trail for the business's own screen. */
export async function signRequestEvents(ctx: RequestContext, requestId: string) {
  const signRequest = await db.signRequest.findFirst({ where: { id: requestId, companyId: ctx.companyId ?? "" }, select: { id: true } });
  if (!signRequest) return [];
  return db.signatureEvent.findMany({ where: { requestId }, orderBy: { at: "asc" }, select: { type: true, at: true, ip: true, userAgent: true } });
}

/** /api/files asks this before handing over a signature image or signed PDF. */
export async function canReadSignatureFile(ctx: RequestContext, fileId: string) {
  if (!ctx.companyId) return false;
  const signRequest = await db.signRequest.findFirst({
    where: { companyId: ctx.companyId, OR: [{ signatureFileId: fileId }, { signedPdfFileId: fileId }] },
    select: { blockId: true },
  });
  return !!signRequest && ctx.enabledBlocks.has(signRequest.blockId) && [...ctx.permissions].some((permission) => permission.startsWith(`${signRequest.blockId}.`));
}

// ---------------------------------------------------------------------
// For the signer (public side, by token)
// ---------------------------------------------------------------------

export type SignRequestRow = Prisma.SignRequestGetPayload<object>;

/** The request behind a link. 404 for anything unknown (never says why). */
export async function requestByToken(token: string): Promise<SignRequestRow> {
  if (!/^[\w-]{20,64}$/.test(token)) throw notFound();
  const signRequest = await db.signRequest.findUnique({ where: { tokenHash: sha256(token) } });
  if (!signRequest) throw notFound();
  return signRequest;
}

export function isExpired(signRequest: SignRequestRow) {
  return signRequest.expiresAt.getTime() < Date.now();
}

/** Throws a friendly 410 unless the link can still be signed or declined. */
export function assertOpen(signRequest: SignRequestRow) {
  if (signRequest.status === "SIGNED") throw gone("This has already been signed.");
  if (signRequest.status === "DECLINED") throw gone("This has already been declined.");
  if (signRequest.status === "REVOKED") throw gone("This link has been replaced or withdrawn. Check your email for a newer one.");
  if (isExpired(signRequest)) throw gone("This link has expired. Ask for a new one.");
}

export async function logEvent(requestId: string, type: string, who: Caller | null, data?: Record<string, unknown>, tx: Tx = db) {
  await tx.signatureEvent.create({
    data: { requestId, type, ip: who?.ip ?? null, userAgent: who?.userAgent ?? null, data: (data ?? undefined) as Prisma.InputJsonValue | undefined },
  });
}

/** Records an open of the link. Returns true the first time. */
export async function markViewed(signRequest: SignRequestRow, who: Caller): Promise<boolean> {
  // One VIEWED event per device per 10 minutes is plenty for the trail.
  const recent = await db.signatureEvent.findFirst({
    where: { requestId: signRequest.id, type: "VIEWED", ip: who.ip, userAgent: who.userAgent, at: { gt: new Date(Date.now() - 10 * 60_000) } },
  });
  if (!recent) await logEvent(signRequest.id, "VIEWED", who);
  if (signRequest.viewedAt) return false;
  const result = await db.signRequest.updateMany({ where: { id: signRequest.id, viewedAt: null }, data: { viewedAt: new Date() } });
  return result.count > 0;
}

/** Emails a 6-digit code to the address the document was sent to. */
export async function sendCode(signRequest: SignRequestRow, who: Caller, wording: { what: string; from: string }) {
  assertOpen(signRequest);
  const sentLastHour = await db.signatureEvent.count({ where: { requestId: signRequest.id, type: "CODE_SENT", at: { gt: new Date(Date.now() - 3_600_000) } } });
  if (sentLastHour >= CODES_PER_HOUR) throw tooMany("That's a lot of codes. Wait a while and try again.");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.signRequest.update({
    where: { id: signRequest.id },
    data: { codeHash: sha256(`${signRequest.id}:${code}`), codeExpiresAt: new Date(Date.now() + CODE_MINUTES * 60_000), codeAttempts: 0 },
  });
  await app().mail.send({
    to: signRequest.recipientEmail,
    subject: `${code} is your code to sign ${wording.what}`,
    text:
      `Your code to sign ${wording.what} from ${wording.from} is:\n\n    ${code}\n\n` +
      `It works for ${CODE_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`,
  });
  await logEvent(signRequest.id, "CODE_SENT", who, { to: signRequest.recipientEmail });
  return { sentTo: maskEmail(signRequest.recipientEmail), minutes: CODE_MINUTES };
}

/** Checks a code. Ties the signer to the inbox the document was sent to. */
export async function checkCode(signRequest: SignRequestRow, code: string, who: Caller) {
  assertOpen(signRequest);
  if (!signRequest.codeHash || !signRequest.codeExpiresAt) throw conflict("Ask for a code first.");
  if (signRequest.codeAttempts >= CODE_TRIES) throw tooMany("Too many tries. Send a new code.");
  if (signRequest.codeExpiresAt.getTime() < Date.now()) throw conflict("That code has run out. Send a new one.");
  const want = Buffer.from(signRequest.codeHash, "hex");
  const got = Buffer.from(sha256(`${signRequest.id}:${code.replace(/\D/g, "")}`), "hex");
  if (!timingSafeEqual(want, got)) {
    await db.signRequest.update({ where: { id: signRequest.id }, data: { codeAttempts: { increment: 1 } } });
    await logEvent(signRequest.id, "CODE_FAILED", who);
    const left = CODE_TRIES - signRequest.codeAttempts - 1;
    throw new HttpError(400, "wrong_code", left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code isn't right. Send a new code.");
  }
  await db.signRequest.update({ where: { id: signRequest.id }, data: { codeVerifiedAt: new Date(), codeHash: null } });
  await logEvent(signRequest.id, "CODE_VERIFIED", who, { email: signRequest.recipientEmail });
  return { verified: true };
}

export function isVerified(signRequest: SignRequestRow) {
  return !!signRequest.codeVerifiedAt && signRequest.codeVerifiedAt.getTime() > Date.now() - VERIFIED_MINUTES * 60_000;
}

export interface SignInput {
  signerName: string;
  signerTitle: string | null;
  signerCompany: string | null;
  method: "DRAWN" | "TYPED";
  /** The signature as a PNG. */
  png: Buffer;
  /** Exactly what the signer agreed to, word for word. */
  consents: string[];
  /** What the signer chose (options, total), kept with the record. */
  details: Record<string, unknown>;
}

export interface CertificateInfo {
  verifyCode: string;
  verifyUrl: string;
  docLabel: string;
  signerName: string;
  signerTitle: string | null;
  signerCompany: string | null;
  method: "DRAWN" | "TYPED";
  verifiedEmail: string;
  docSha256: string;
  seal: { subject: string; fingerprint: string };
  events: { type: string; at: Date; ip: string | null; userAgent: string | null }[];
  signedAt: Date;
}

/**
 * Signs. The owning block renders the signed PDF (its document with the
 * signature filled in, plus the certificate page) from what's passed to
 * `render`; this seals it, stores it and closes the request.
 */
export async function completeSignature(
  signRequest: SignRequestRow,
  input: SignInput,
  who: Caller,
  docLabel: string,
  render: (parts: { signatureDataUrl: string; certificate: CertificateInfo }) => Promise<Buffer>,
) {
  assertOpen(signRequest);
  if (!isVerified(signRequest)) throw conflict("Enter the code from your email first.");
  if (input.png.byteLength > 400_000 || input.png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new HttpError(400, "bad_signature", "The signature didn't come through. Try signing again.");
  }
  const signedAt = new Date();
  await logEvent(signRequest.id, "CONSENTED", who, { consents: input.consents });
  const verifyCode = newVerifyCode();
  const prior = await db.signatureEvent.findMany({ where: { requestId: signRequest.id }, orderBy: { at: "asc" }, select: { type: true, at: true, ip: true, userAgent: true } });
  const certificate: CertificateInfo = {
    verifyCode,
    verifyUrl: publicUrl(`/verify/${verifyCode}`),
    docLabel,
    signerName: input.signerName,
    signerTitle: input.signerTitle,
    signerCompany: input.signerCompany,
    method: input.method,
    verifiedEmail: signRequest.recipientEmail,
    docSha256: signRequest.docSha256,
    seal: await sealInfo(),
    events: [...prior, { type: "SIGNED", at: signedAt, ip: who.ip, userAgent: who.userAgent }],
    signedAt,
  };
  const unsealed = await render({ signatureDataUrl: `data:image/png;base64,${input.png.toString("base64")}`, certificate });
  const sealed = await sealPdf(unsealed, { reason: `${docLabel} signed by ${input.signerName}`, name: input.signerName, signingTime: signedAt });
  const signedSha256 = sha256(sealed);

  return db.$transaction(async (tx) => {
    const sigFile = await saveGeneratedFile(tx, { companyId: signRequest.companyId, userId: null, blockId: MOD, data: input.png, mime: "image/png", name: `Signature ${input.signerName}.png`, ext: "png" });
    const pdfFile = await saveGeneratedFile(tx, { companyId: signRequest.companyId, userId: null, blockId: MOD, data: sealed, mime: "application/pdf", name: `${docLabel} signed.pdf`, ext: "pdf" });
    // Only one signature wins, even if the button is pressed twice.
    const claimed = await tx.signRequest.updateMany({
      where: { id: signRequest.id, status: "OPEN" },
      data: {
        status: "SIGNED",
        signedAt,
        signerName: input.signerName,
        signerTitle: input.signerTitle,
        signerCompany: input.signerCompany,
        signMethod: input.method,
        signatureFileId: sigFile.id,
        details: input.details as Prisma.InputJsonValue,
        signedPdfFileId: pdfFile.id,
        signedSha256,
        verifyCode,
      },
    });
    if (!claimed.count) throw gone("This has already been answered.");
    await logEvent(signRequest.id, "SIGNED", who, { signer: input.signerName, method: input.method, docSha256: signRequest.docSha256, signedSha256, ...input.details }, tx);
    return { signedPdf: sealed, signedPdfFileId: pdfFile.id, verifyCode, signedAt };
  });
}

export async function declineRequest(signRequest: SignRequestRow, reason: string | null, who: Caller) {
  assertOpen(signRequest);
  const result = await db.signRequest.updateMany({ where: { id: signRequest.id, status: "OPEN" }, data: { status: "DECLINED", declinedAt: new Date(), declineReason: reason } });
  if (!result.count) throw gone("This has already been answered.");
  await logEvent(signRequest.id, "DECLINED", who, reason ? { reason } : undefined);
}

/** The signed PDF for someone holding the link. */
export async function signedPdfFor(signRequest: SignRequestRow) {
  if (signRequest.status !== "SIGNED" || !signRequest.signedPdfFileId) throw notFound();
  return db.storedFile.findUniqueOrThrow({ where: { id: signRequest.signedPdfFileId } });
}

// ---------------------------------------------------------------------
// Verify page (anyone with the code on the certificate)
// ---------------------------------------------------------------------

/** Only match / no match and the date: nothing about who or what. */
export async function lookupVerifyCode(input: string) {
  const code = normaliseVerifyCode(input);
  if (!/^[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code)) return { found: false as const, code };
  const signRequest = await db.signRequest.findUnique({ where: { verifyCode: code }, select: { signedAt: true, status: true } });
  if (!signRequest || signRequest.status !== "SIGNED" || !signRequest.signedAt) return { found: false as const, code };
  return { found: true as const, code, signedAt: signRequest.signedAt };
}

/** Is this exact file the one that was signed? */
export async function verifyFile(input: string, bytes: Uint8Array) {
  const code = normaliseVerifyCode(input);
  const signRequest = await db.signRequest.findUnique({ where: { verifyCode: code }, select: { signedSha256: true, signedAt: true } });
  if (!signRequest?.signedSha256) return { found: false, match: false };
  const match = sha256(Buffer.from(bytes)) === signRequest.signedSha256;
  return { found: true, match, signedAt: signRequest.signedAt };
}
