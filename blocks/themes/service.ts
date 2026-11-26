// Themes people make (Settings › Themes). Your own themes belong to you
// (ownerUserId), like your Wallet, so they come with you to any business.
// A business's themes (companyId) can be picked by everyone in it and are
// changed by people with themes.business.manage (Owners by default).
import { audit, db, type Prisma, type Tx } from "@grid/db";
import { badRequest, can, forbidden, notFound, type RequestContext } from "@grid/core";
import { resolveTokens, type KeyColours, type ThemeTokens, type TokenOverrides } from "@grid/ui/lib/custom-themes";
import { customThemeIdOf } from "@grid/ui/lib/themes";
import type { CreateThemeInput, ThemeFile, ThemeInput, ThemeScope } from "./validation";

const BLOCK = "themes";
const MANAGE = "themes.business.manage";

type ThemeRow = Awaited<ReturnType<typeof db.customTheme.findFirstOrThrow>>;
type Look = "grid" | "soft";

export interface ThemeView {
  id: string;
  name: string;
  description: string;
  look: Look;
  startedFrom: string;
  keyColours: KeyColours;
  overrides: TokenOverrides;
  scope: ThemeScope;
  /** You can change or delete it. */
  canEdit: boolean;
  updatedAt: Date;
}

const lookOf = (value: string): Look => (value === "soft" ? "soft" : "grid");

function view(ctx: RequestContext, theme: ThemeRow): ThemeView {
  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    look: lookOf(theme.look),
    startedFrom: theme.startedFrom,
    keyColours: theme.keyColours as unknown as KeyColours,
    overrides: (theme.overrides ?? {}) as TokenOverrides,
    scope: theme.companyId ? "business" : "mine",
    canEdit: canEdit(ctx, theme),
    updatedAt: theme.updatedAt,
  };
}

function canEdit(ctx: RequestContext, theme: ThemeRow): boolean {
  if (theme.ownerUserId) return theme.ownerUserId === ctx.userId;
  return !!theme.companyId && theme.companyId === ctx.companyId && can(ctx, MANAGE);
}

/** Your own, or one belonging to a business you work in. */
async function canSee(userId: string, theme: ThemeRow, tx: Tx = db): Promise<boolean> {
  if (theme.ownerUserId) return theme.ownerUserId === userId;
  if (!theme.companyId) return false;
  const membership = await tx.membership.findFirst({
    where: { userId, companyId: theme.companyId, status: "ACTIVE", company: { deletedAt: null } },
    select: { id: true },
  });
  return !!membership;
}

async function findVisible(ctx: RequestContext, id: string, tx: Tx = db): Promise<ThemeRow> {
  const theme = await tx.customTheme.findUnique({ where: { id } });
  if (!theme || !(await canSee(ctx.userId, theme, tx))) throw notFound("Theme not found");
  return theme;
}

async function findEditable(ctx: RequestContext, id: string, tx: Tx = db): Promise<ThemeRow> {
  const theme = await findVisible(ctx, id, tx);
  if (!canEdit(ctx, theme)) throw forbidden(theme.companyId ? "Only the Owner can change the business's themes" : "That isn't your theme");
  return theme;
}

/** Where a new theme goes: you, or the business you're working in (if you may). */
function owner(ctx: RequestContext, scope: ThemeScope): { ownerUserId: string | null; companyId: string | null } {
  if (scope === "mine") return { ownerUserId: ctx.userId, companyId: null };
  if (!ctx.companyId) throw badRequest("Pick a business first");
  if (!can(ctx, MANAGE)) throw forbidden("Only the Owner can add themes for the business");
  return { ownerUserId: null, companyId: ctx.companyId };
}

/** Settings › Themes: yours, the business's, and which one you're using. */
export async function listThemes(ctx: RequestContext) {
  const [mine, business, user] = await Promise.all([
    db.customTheme.findMany({ where: { ownerUserId: ctx.userId }, orderBy: { name: "asc" } }),
    ctx.companyId ? db.customTheme.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { settings: true } }),
  ]);
  return {
    mine: mine.map((theme) => view(ctx, theme)),
    business: business.map((theme) => view(ctx, theme)),
    /** The theme you're using: a built-in id, or "custom:<id>". */
    current: ((user.settings ?? {}) as { theme?: unknown }).theme ?? "grid",
    canManageBusiness: !!ctx.companyId && can(ctx, MANAGE),
    solo: ctx.solo,
  };
}

export async function getTheme(ctx: RequestContext, id: string): Promise<ThemeView> {
  return view(ctx, await findVisible(ctx, id));
}

function data(input: ThemeInput) {
  return {
    name: input.name,
    description: input.description,
    look: input.look,
    startedFrom: input.startedFrom,
    keyColours: input.keyColours as Prisma.InputJsonValue,
    overrides: input.overrides as Prisma.InputJsonValue,
  };
}

export async function createTheme(ctx: RequestContext, input: CreateThemeInput, action = "created"): Promise<ThemeView> {
  const { scope, ...theme } = input;
  const where = owner(ctx, scope);
  return db.$transaction(async (tx) => {
    const row = await tx.customTheme.create({ data: { ...where, createdById: ctx.userId, ...data(theme) } });
    await audit(tx, {
      blockId: BLOCK,
      actorId: ctx.userId,
      companyId: where.companyId,
      entityType: "CustomTheme",
      entityId: row.id,
      action,
      diff: { name: theme.name, scope, look: theme.look },
    });
    return view(ctx, row);
  });
}

export async function updateTheme(ctx: RequestContext, id: string, input: ThemeInput): Promise<ThemeView> {
  return db.$transaction(async (tx) => {
    const before = await findEditable(ctx, id, tx);
    const row = await tx.customTheme.update({ where: { id }, data: data(input) });
    await audit(tx, {
      blockId: BLOCK,
      actorId: ctx.userId,
      companyId: before.companyId,
      entityType: "CustomTheme",
      entityId: id,
      action: "updated",
      diff: { before: { name: before.name, look: before.look, keyColours: before.keyColours, overrides: before.overrides }, after: input } as Prisma.InputJsonValue,
    });
    return view(ctx, row);
  });
}

/** Anyone using it goes back to Grid (an unknown theme falls back). Kept in the log in full. */
export async function deleteTheme(ctx: RequestContext, id: string): Promise<{ ok: true }> {
  await db.$transaction(async (tx) => {
    const theme = await findEditable(ctx, id, tx);
    await tx.customTheme.delete({ where: { id } });
    await audit(tx, {
      blockId: BLOCK,
      actorId: ctx.userId,
      companyId: theme.companyId,
      entityType: "CustomTheme",
      entityId: id,
      action: "deleted",
      diff: { name: theme.name, look: theme.look, startedFrom: theme.startedFrom, keyColours: theme.keyColours, overrides: theme.overrides } as Prisma.InputJsonValue,
    });
  });
  return { ok: true };
}

/**
 * A copy of a theme you can see: into your own (to change a business theme
 * your way) or into the business's (Share with the business).
 */
export async function copyTheme(ctx: RequestContext, id: string, scope: ThemeScope): Promise<ThemeView> {
  const theme = await findVisible(ctx, id);
  const sameScope = (theme.companyId ? "business" : "mine") === scope;
  return createTheme(
    ctx,
    {
      scope,
      name: sameScope ? `${theme.name} (copy)` : theme.name,
      description: theme.description,
      look: lookOf(theme.look),
      startedFrom: theme.startedFrom,
      keyColours: theme.keyColours as unknown as KeyColours,
      overrides: (theme.overrides ?? {}) as Record<string, string>,
    },
    scope === "business" && !sameScope ? "shared" : "copied",
  );
}

/** The theme as a small file, to bring into another Grid server. */
export async function exportTheme(ctx: RequestContext, id: string): Promise<ThemeFile> {
  const theme = await findVisible(ctx, id);
  return {
    format: "grid-theme",
    version: 1,
    theme: {
      name: theme.name,
      description: theme.description,
      look: lookOf(theme.look),
      startedFrom: theme.startedFrom,
      keyColours: theme.keyColours as unknown as KeyColours,
      overrides: (theme.overrides ?? {}) as Record<string, string>,
    },
  };
}

export async function importTheme(ctx: RequestContext, scope: ThemeScope, file: ThemeFile): Promise<ThemeView> {
  return createTheme(ctx, { scope, ...file.theme }, "imported");
}

/** What the app puts on <html> for someone using a theme they or their business made. */
export interface AppliedTheme {
  id: string;
  name: string;
  look: Look;
  tokens: ThemeTokens;
}

/**
 * For the request context: the custom theme a person picked, or null when
 * they use a built-in one, or theirs was deleted, or they've left that business.
 */
export async function appliedTheme(userId: string, setting: unknown): Promise<AppliedTheme | null> {
  const id = customThemeIdOf(setting);
  if (!id) return null;
  const theme = await db.customTheme.findUnique({ where: { id } }).catch(() => null);
  if (!theme || !(await canSee(userId, theme))) return null;
  const look = lookOf(theme.look);
  return { id: theme.id, name: theme.name, look, tokens: resolveTokens(theme.keyColours as unknown as KeyColours, look, (theme.overrides ?? {}) as TokenOverrides) };
}

/** Storage clean-up, when a deleted business is removed for good. */
export async function purgeCompanyThemes(companyId: string): Promise<void> {
  await db.customTheme.deleteMany({ where: { companyId } });
}
