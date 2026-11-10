// Branding on documents (DocTheme), and what documents need to show it.
import { badRequest, requireCompany, type RequestContext } from "@grid/core";
import { attachFile, audit, db, openStoredFile } from "@grid/db";
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
  address: string | null;
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
  await db.$transaction(async (tx) => {
    const previous = await tx.docTheme.findUnique({ where: { companyId } });
    if (input.logoFileId && input.logoFileId !== previous?.logoFileId) {
      try {
        await attachFile(tx, input.logoFileId, { companyId, userId: ctx.userId, blockId: MOD });
      } catch {
        throw badRequest("That logo upload can't be used. Try uploading it again.");
      }
    }
    const data = { ...input };
    await tx.docTheme.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "DocTheme", entityId: companyId, action: "updated", diff: input });
  });
  return getTheme(ctx);
}

/** Anyone in the company may see its logo. */
export async function canReadLogo(ctx: RequestContext, fileId: string): Promise<boolean> {
  if (!ctx.companyId) return false;
  const docTheme = await db.docTheme.findUnique({ where: { companyId: ctx.companyId } });
  return docTheme?.logoFileId === fileId;
}
