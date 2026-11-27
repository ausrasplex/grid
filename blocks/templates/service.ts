// Branding on documents (DocTheme), and what documents need to show it.
import { addressData, addressFromColumns, badRequest, requireCompany, type Address, type RequestContext } from "@grid/core";
import { attachFile, audit, db, openStoredFile, readStoredFile } from "@grid/db";
import { useBrandingLogo } from "@grid/block-companies";
import type { ThemeInput } from "./validation";

const MOD = "templates";

export interface Theme {
  companyName: string;
  logoFileId: string | null;
  /** The logo as a data: URL, ready for a PDF (no sign-in needed to load it). */
  logoDataUrl: string | null;
  accentColor: string;
  phone: string | null;
  email: string | null;
  /** The one line: "12 Smith St, Brunswick VIC 3056". */
  address: string | null;
  addressParts: Address | null;
  website: string | null;
  licenceLabel: string | null;
  licenceNumber: string | null;
  footerText: string | null;
}

async function dataUrl(fileId: string): Promise<string | null> {
  const file = await db.storedFile.findFirst({ where: { id: fileId, purgedAt: null } });
  if (!file) return null;
  // The original keeps a PNG logo's transparency.
  const { stream, mime } = await openStoredFile(file, "original");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`;
}

/** The company's branding, for documents. Works without a request (e.g. in a background job). */
export async function themeFor(companyId: string): Promise<Theme> {
  const [company, theme] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } }),
    db.docTheme.findUnique({ where: { companyId } }),
  ]);
  return {
    companyName: company.name,
    logoFileId: theme?.logoFileId ?? null,
    logoDataUrl: theme?.logoFileId ? await dataUrl(theme.logoFileId) : null,
    accentColor: theme?.accentColor ?? "#b45309",
    phone: theme?.phone ?? null,
    email: theme?.email ?? null,
    address: theme?.address ?? null,
    addressParts: theme?.address ? addressFromColumns(theme) : null,
    website: theme?.website ?? null,
    licenceLabel: theme?.licenceLabel ?? null,
    licenceNumber: theme?.licenceNumber ?? null,
    footerText: theme?.footerText ?? null,
  };
}

export async function getTheme(ctx: RequestContext): Promise<Omit<Theme, "logoDataUrl">> {
  const { logoDataUrl: _l, ...theme } = await themeFor(requireCompany(ctx));
  return theme;
}

export async function updateTheme(ctx: RequestContext, input: ThemeInput) {
  const companyId = requireCompany(ctx);
  const logoBefore = await db.$transaction(async (tx) => {
    const previous = await tx.docTheme.findUnique({ where: { companyId } });
    if (input.logoFileId && input.logoFileId !== previous?.logoFileId) {
      try {
        await attachFile(tx, input.logoFileId, { companyId, userId: ctx.userId, blockId: MOD });
      } catch {
        throw badRequest("That logo upload can't be used. Try uploading it again.");
      }
    }
    const { address, ...rest } = input;
    const data = { ...rest, ...addressData(address ?? null) };
    await tx.docTheme.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "DocTheme", entityId: companyId, action: "updated", diff: { ...rest, address: data.address ?? null } });
    return previous?.logoFileId ?? null;
  });
  // A new logo makes the business picture, unless the business uploaded its own.
  if (input.logoFileId !== undefined && input.logoFileId !== logoBefore) await logoToPicture(companyId, ctx.userId, input.logoFileId).catch((error) => console.error("[branding] couldn't make the business picture from the logo", error));
  return getTheme(ctx);
}

/** The business picture from the Branding logo, when there's a logo (after taking off a picture of its own). */
export async function pictureFromLogo(companyId: string, actorId: string | null) {
  const theme = await db.docTheme.findUnique({ where: { companyId }, select: { logoFileId: true } });
  if (theme?.logoFileId) await logoToPicture(companyId, actorId, theme.logoFileId);
}

async function logoToPicture(companyId: string, actorId: string | null, logoFileId: string | null) {
  const file = logoFileId ? await db.storedFile.findFirst({ where: { id: logoFileId, purgedAt: null } }) : null;
  await useBrandingLogo(companyId, actorId, file ? await readStoredFile(file) : null);
}

/**
 * Once, at start-up: businesses that had a Branding logo before business
 * pictures existed get their picture made from it.
 */
export async function pictureFromExistingLogos() {
  const themes = await db.docTheme.findMany({ where: { logoFileId: { not: null } }, select: { companyId: true, logoFileId: true } });
  const companies = await db.company.findMany({ where: { id: { in: themes.map((theme) => theme.companyId) }, logoKey: null, deletedAt: null }, select: { id: true } });
  const waiting = new Set(companies.map((company) => company.id));
  let made = 0;
  for (const theme of themes) {
    if (!waiting.has(theme.companyId)) continue;
    try {
      await logoToPicture(theme.companyId, null, theme.logoFileId);
      made++;
    } catch (error) {
      console.error("[branding] couldn't make a business picture from the logo", theme.companyId, error);
    }
  }
  return made;
}

/** Anyone in the company may see its logo. */
export async function canReadLogo(ctx: RequestContext, fileId: string): Promise<boolean> {
  if (!ctx.companyId) return false;
  const docTheme = await db.docTheme.findUnique({ where: { companyId: ctx.companyId } });
  return docTheme?.logoFileId === fileId;
}
