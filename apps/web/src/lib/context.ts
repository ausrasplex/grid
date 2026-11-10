// Builds the RequestContext for the current request: who the user is,
// which company they're acting as, what they may do there, which
// blocks are on and whether the company is solo. Every API call and
// page uses this.

import "server-only";
import { cache } from "react";
import type { RequestContext } from "@grid/core";
import { db } from "@grid/db";
import { defaultCompanyId, resolveAccess } from "@grid/block-companies";
import { registry } from "@/blocks";
import { getActiveCompanyId, getSessionUserId } from "./session";

export interface AppContext extends RequestContext {
  user: { id: string; name: string; email: string; serverAdmin: boolean };
  company: { id: string; name: string; role: string } | null;
}

/** Null when nobody is signed in. Cached for the duration of one request. */
export const getContext = cache(async (): Promise<AppContext | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, name: true, email: true, serverAdmin: true },
  });
  if (!user) return null;

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

  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, name: true } });
  return {
    ...base,
    companyId,
    company: { ...company, role: access.roleName },
    permissions: access.permissions,
    enabledBlocks: access.enabledBlocks,
    solo: access.solo,
  };
});
