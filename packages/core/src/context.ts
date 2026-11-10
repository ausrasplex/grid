import type { Permission, RequestContext } from "./block.ts";
import { badRequest, forbidden } from "./errors.ts";

export function can(ctx: RequestContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

export function assertCan(ctx: RequestContext, permission: Permission): void {
  if (!can(ctx, permission)) throw forbidden();
}

/** Returns the active company id or throws if none is selected. */
export function requireCompany(ctx: RequestContext): string {
  if (!ctx.companyId) throw badRequest("Select a company first");
  return ctx.companyId;
}
