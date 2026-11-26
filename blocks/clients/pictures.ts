// Pictures in the Clients list: a business's logo and a person's photo
// (docs/quotations-block.md "Pictures"). A person without a photo shows
// their business's logo, then their initials.

import { notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, pictureFolder, pictureUrl, removePicture, savePicture } from "@grid/db";

const MOD = "clients";

export type PictureOwner = "client" | "business";

/** Saves a new picture (or none) on a client or business; the old file is deleted after. */
export async function setClientPicture(ctx: RequestContext, owner: PictureOwner, id: string, data: Buffer | null) {
  const companyId = requireCompany(ctx);
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound(owner === "client" ? "Client not found" : "Business not found");
  // A business's logo is kept whole; a person's photo fills the circle.
  const key = data ? await savePicture(pictureFolder.clients(companyId), data, owner === "business" ? "contain" : "cover") : null;
  let previous: string | null = null;
  try {
    previous = await db.$transaction(async (tx) => {
      if (owner === "client") {
        const client = await tx.client.findFirst({ where: { id, companyId, deletedAt: null }, select: { photoKey: true } });
        if (!client) throw notFound("Client not found");
        await tx.client.update({ where: { id }, data: { photoKey: key } });
        await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Client", entityId: id, action: key ? "picture_changed" : "picture_removed" });
        return client.photoKey;
      }
      const business = await tx.clientBusiness.findFirst({ where: { id, companyId, deletedAt: null }, select: { logoKey: true } });
      if (!business) throw notFound("Business not found");
      await tx.clientBusiness.update({ where: { id }, data: { logoKey: key } });
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "ClientBusiness", entityId: id, action: key ? "picture_changed" : "picture_removed" });
      return business.logoKey;
    });
  } catch (error) {
    await removePicture(key).catch(() => {});
    throw error;
  }
  if (previous && previous !== key) await removePicture(previous).catch((error) => console.error("[pictures] couldn't delete an old client picture", error));
  return { pictureUrl: pictureUrl(key) };
}

/** May this person see this picture? Only their business's clients' pictures, removed ones too (old jobs). */
export async function canSeeClientPicture(ctx: RequestContext, key: string): Promise<boolean> {
  if (!ctx.companyId || !key.startsWith(`pictures/${pictureFolder.clients(ctx.companyId)}/`)) return false;
  const [client, business] = await Promise.all([
    db.client.findFirst({ where: { companyId: ctx.companyId, photoKey: key }, select: { id: true } }),
    db.clientBusiness.findFirst({ where: { companyId: ctx.companyId, logoKey: key }, select: { id: true } }),
  ]);
  return !!(client || business);
}
