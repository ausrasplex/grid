// A business's own icons (phase 4c part 3): Settings › Icons, and in
// the plan viewer's icon library beside the built-in ones. An icon is built
// from a shape and letters, or is an uploaded SVG (made safe by svg.ts here,
// on the server, whatever the browser sent). A row with `replacesKey` gives a
// built-in icon the business's own look instead.

import "server-only";
import { badRequest, conflict, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db } from "@grid/db";
import { TRADES, iconByKey, isCustomKey, tradeOf, type CustomIconRow } from "./icons";
import { SvgError, sanitiseSvg } from "./svg";
import type { CustomIconInput } from "./validation";

const MOD = "markups";

const rowOf = (icon: {
  id: string;
  trade: string;
  name: string;
  words: string[];
  outline: string;
  label: string;
  svg: string | null;
  tint: boolean;
  replacesKey: string | null;
  deletedAt: Date | null;
}): CustomIconRow => ({
  id: icon.id,
  trade: icon.trade,
  name: icon.name,
  words: icon.words,
  outline: icon.outline,
  label: icon.label,
  svg: icon.svg,
  tint: icon.tint,
  replacesKey: icon.replacesKey,
  deleted: !!icon.deletedAt,
});

/** The upload made safe, or a plain-words 400. */
function safeSvg(svg: string | null | undefined): string | null {
  if (!svg) return null;
  try {
    return sanitiseSvg(svg);
  } catch (failure) {
    if (failure instanceof SvgError) throw badRequest(failure.message);
    throw failure;
  }
}

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
  // Replacing a built-in: it stays in its own trade.
  const replacesKey = input.replacesKey ?? null;
  const trade = replacesKey ? tradeOf(replacesKey)!.id : input.trade;
  checkTrade(trade);
  const svg = safeSvg(input.svg);
  const data = {
    trade,
    name: input.name,
    words: replacesKey ? [] : tidyWords(input.words),
    outline: input.outline,
    label: svg ? "" : input.label,
    svg,
    tint: !!svg && input.tint,
  };
  const saved = await db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.customIcon.findFirst({ where: { id, companyId, deletedAt: null } });
      if (!before) throw notFound("That icon isn't there any more");
      if ((before.replacesKey ?? null) !== replacesKey) throw badRequest("That icon can't be moved to another built-in icon");
      const icon = await tx.customIcon.update({ where: { id }, data });
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "CustomIcon", entityId: id, action: "updated", diff: { before: { ...rowOf(before) }, after: data } });
      return icon;
    }
    if (replacesKey && (await tx.customIcon.count({ where: { companyId, replacesKey, deletedAt: null } })))
      throw conflict(`${iconByKey(replacesKey)!.name} already has your own look. Change that one instead.`);
    const icon = await tx.customIcon.create({ data: { ...data, replacesKey, companyId, createdById: ctx.userId } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "CustomIcon", entityId: icon.id, action: "added", diff: data });
    return icon;
  });
  return rowOf(saved);
}

/**
 * Out of the library; icons already placed keep drawing and counting. For a
 * replacement, this puts the built-in look back.
 */
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
