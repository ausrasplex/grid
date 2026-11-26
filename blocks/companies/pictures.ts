// The business picture (Settings › Business details): a square picture
// for the business, shown as the team's profile picture until each person
// adds their own (docs/quotations-block.md "Pictures"). Until one is
// uploaded here, it's made from the Branding logo.

import { requireCompany, type RequestContext } from "@grid/core";
import { audit, db, pictureFolder, pictureUrl, removePicture, savePicture } from "@grid/db";

const MOD = "companies";

/** Swaps the picture and records it; the old file is deleted after. */
async function swap(companyId: string, actorId: string | null, key: string | null, fromBranding: boolean, onlyIf?: (current: { logoKey: string | null; logoFromBranding: boolean }) => boolean) {
  const previous = await db.$transaction(async (tx) => {
    const current = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { logoKey: true, logoFromBranding: true } });
    if (onlyIf && !onlyIf(current)) return undefined;
    await tx.company.update({ where: { id: companyId }, data: { logoKey: key, logoFromBranding: key ? fromBranding : false } });
    await audit(tx, {
      blockId: MOD,
      actorId,
      companyId,
      entityType: "Company",
      entityId: companyId,
      action: key ? "picture_changed" : "picture_removed",
      diff: fromBranding ? { fromBrandingLogo: true } : undefined,
    });
    return current.logoKey;
  });
  if (previous === undefined) {
    // Not swapped: the new file isn't wanted.
    await removePicture(key).catch(() => {});
    return false;
  }
  if (previous && previous !== key) await removePicture(previous).catch((error) => console.error("[pictures] couldn't delete the old business picture", error));
  return true;
}

/** Settings › Business details: upload a square picture of its own (photo or logo). */
export async function uploadBusinessPicture(ctx: RequestContext, data: Buffer) {
  const companyId = requireCompany(ctx);
  // A logo is kept whole; a photo of the van or the team fills the circle.
  const key = await savePicture(pictureFolder.company(companyId), data, "contain");
  await swap(companyId, ctx.userId, key, false);
  return businessPicture(companyId);
}

/** Removes it. The caller then makes one from the Branding logo, if there is one. */
export async function removeBusinessPicture(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  await swap(companyId, ctx.userId, null, false);
  return businessPicture(companyId);
}

/**
 * The Branding logo changed (Settings › Branding): make the business
 * picture from it, unless the business uploaded one of its own. `logo`
 * null means the logo was taken off, which takes off a picture made from it.
 */
export async function useBrandingLogo(companyId: string, actorId: string | null, logo: Buffer | null) {
  const usesBranding = (current: { logoKey: string | null; logoFromBranding: boolean }) => !current.logoKey || current.logoFromBranding;
  if (!logo) return swap(companyId, actorId, null, false, (current) => current.logoFromBranding);
  const key = await savePicture(pictureFolder.company(companyId), logo, "contain");
  return swap(companyId, actorId, key, true, usesBranding);
}

/** What Settings › Business details shows. */
export async function businessPicture(companyId: string) {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { logoKey: true, logoFromBranding: true } });
  return { pictureUrl: pictureUrl(company.logoKey), fromBranding: company.logoFromBranding };
}

/** The business picture's key, for working out people's pictures (null: none). */
export async function businessPictureKey(companyId: string | null | undefined): Promise<string | null> {
  if (!companyId) return null;
  const company = await db.company.findUnique({ where: { id: companyId }, select: { logoKey: true } });
  return company?.logoKey ?? null;
}
