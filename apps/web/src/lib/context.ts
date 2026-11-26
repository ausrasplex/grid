// Builds the RequestContext for the current request: who the user is,
// which company they're acting as, what they may do there, which
// blocks are on and whether the company is solo. Every API call and
// page uses this.

import "server-only";
import { cache } from "react";
import type { RequestContext } from "@grid/core";
import { avatarUrl, db } from "@grid/db";
import { lookOf, themeOf, type Look, type ThemeId } from "@grid/ui";
import { appliedTheme, type AppliedTheme } from "@grid/block-themes";
import { defaultCompanyId, resolveAccess } from "@grid/block-companies";
import { registry } from "@/blocks";
import { getActiveCompanyId, getSessionUserId } from "./session";

export interface AppContext extends RequestContext {
  /**
   * avatarUrl: their picture, or null for initials.
   * theme: the built-in theme picked ("grid" when they use one they made);
   * customTheme: the one they or their business made, when they use it;
   * look: the shapes and font either way (use this, not lookOf(theme)).
   */
  user: { id: string; name: string; email: string; serverAdmin: boolean; avatarUrl: string | null; theme: ThemeId; customTheme: AppliedTheme | null; look: Look; pinned: string[] };
  company: { id: string; name: string; role: string } | null;
}

/** Settings pages pinned to the menu (User.settings.pinned): their menu ids, in the order pinned. */
function pinnedOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").slice(0, 30) : [];
}

/** Null when nobody is signed in. Cached for the duration of one request. */
export const getContext = cache(async (): Promise<AppContext | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const found = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, name: true, email: true, serverAdmin: true, avatarKey: true, image: true, settings: true },
  });
  if (!found) return null;
  const settings = (found.settings ?? {}) as { theme?: unknown; pinned?: unknown };
  const theme = themeOf(settings.theme);
  const customTheme = await appliedTheme(found.id, settings.theme);
  const user = {
    id: found.id,
    name: found.name,
    email: found.email,
    serverAdmin: found.serverAdmin,
    avatarUrl: avatarUrl(found),
    theme,
    customTheme,
    look: customTheme?.look ?? lookOf(theme),
    pinned: pinnedOf(settings.pinned),
  };

  const required = registry.effectiveEnabled([]);
  const base: AppContext = {
    userId: user.id,
    user,
    companyId: null,
    company: null,
    permissions: new Set(),
    enabledBlocks: required,
    solo: false,
  };

  // The switcher's choice, else the person's first company, so someone
  // with one business never has to pick it.
  let companyId = await getActiveCompanyId();
  let access = companyId ? await resolveAccess(user.id, companyId) : null;
  if (!access) {
    companyId = await defaultCompanyId(user.id);
    access = companyId ? await resolveAccess(user.id, companyId) : null;
  }
  if (!companyId || !access) return base;

  const { logoKey, ...company } = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, name: true, logoKey: true } });
  return {
    ...base,
    // Until they add their own, people show their business's picture.
    user: { ...user, avatarUrl: avatarUrl(found, logoKey) },
    companyId,
    company: { ...company, role: access.roleName },
    permissions: access.permissions,
    enabledBlocks: access.enabledBlocks,
    solo: access.solo,
  };
});
