// A business's own icons (phase 4c part 3): Settings › Custom icons, and in
// the plan viewer's icon library beside the built-in ones.

import "server-only";
import { badRequest, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db } from "@grid/db";
import { TRADES, isCustomKey, type CustomIconRow } from "./icons";
import type { CustomIconInput } from "./validation";

const MOD = "markups";

const rowOf = (icon: { id: string; trade: string; name: string; words: string[]; outline: string; label: string; deletedAt: Date | null }): CustomIconRow => ({
  id: icon.id,
  trade: icon.trade,
  name: icon.name,
  words: icon.words,
  outline: icon.outline,
  label: icon.label,
  deleted: !!icon.deletedAt,
});

/** Every custom icon of the business, deleted ones too (placed ones still draw). */
export async function customIcons(ctx: RequestContext): Promise<CustomIconRow[]> {
  const companyId = requireCompany(ctx);
  const rows = await db.customIcon.findMany({ where: { companyId }, orderBy: [{ trade: "asc" }, { name: "asc" }] });
  return rows.map(rowOf);
}

const tidyWords = (words: string[]) => [...new Set(words.map((word) => word.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
const checkTrade = (trade: string) => {
  if (trade !== "custom" && !TRADES.some((entry) => entry.id === trade)) throw badRequest("Pick a trade");
};

export async function saveCustomIcon(ctx: RequestContext, id: string | null, input: CustomIconInput) {
  const companyId = requireCompany(ctx);
  checkTrade(input.trade);
  const data = { trade: input.trade, name: input.name, words: tidyWords(input.words), outline: input.outline, label: input.label };
  const saved = await db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.customIcon.findFirst({ where: { id, companyId, deletedAt: null } });
      if (!before) throw notFound("That icon isn't there any more");
      const icon = await tx.customIcon.update({ where: { id }, data });
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "CustomIcon", entityId: id, action: "updated", diff: { before: { ...rowOf(before) }, after: data } });
      return icon;
    }
    const icon = await tx.customIcon.create({ data: { ...data, companyId, createdById: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "CustomIcon", entityId: icon.id, action: "added", diff: data });
    return icon;
  });
  return rowOf(saved);
}

/** Out of the library; icons already placed keep drawing and counting. */
export async function deleteCustomIcon(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const icon = await tx.customIcon.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!icon) throw notFound("That icon isn't there any more");
    await tx.customIcon.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "CustomIcon", entityId: id, action: "deleted", diff: { name: icon.name } });
  });
  return { id, deleted: true };
}

/** Placing a custom icon: it must be this business's, and still in the library. */
export async function assertCustomIcon(companyId: string, key: string) {
  if (!isCustomKey(key)) return;
  const exists = await db.customIcon.count({ where: { id: key.slice("custom.".length), companyId, deletedAt: null } });
  if (!exists) throw badRequest("That custom icon isn't in your library any more");
}

/** A custom icon's name, for the activity log. */
export async function customIconName(key: string) {
  if (!isCustomKey(key)) return null;
  return (await db.customIcon.findUnique({ where: { id: key.slice("custom.".length) }, select: { name: true } }))?.name ?? null;
}
