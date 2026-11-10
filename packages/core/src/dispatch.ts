// Turns /api/<blockId>/<path> into a block route call, enforcing
// "block enabled for this company" and the route's permission first.
// Framework-free so it can be tested without Next.js.

import type { RequestContext, Routes } from "./block.ts";
import type { BlockRegistry } from "./registry.ts";
import { matchRoute } from "./routing.ts";
import { badRequest, forbidden, notFound } from "./errors.ts";

export interface DispatchInput {
  blockId: string;
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  ctx: RequestContext;
}

const routeCache = new Map<string, Promise<Routes>>();

export async function dispatch(registry: BlockRegistry, input: DispatchInput): Promise<unknown> {
  const definition = registry.get(input.blockId);
  if (!definition || !definition.routes) throw notFound();

  // Required blocks work before a company is chosen (e.g. creating your first company).
  if (!definition.required && !input.ctx.enabledBlocks.has(definition.id)) {
    throw forbidden(`The ${definition.name} block is switched off for this company`);
  }

  let routes = routeCache.get(definition.id);
  if (!routes) {
    routes = definition.routes();
    routeCache.set(definition.id, routes);
  }
  const match = matchRoute(await routes, input.method, input.path);
  if (!match) throw notFound();

  const { route, params } = match;
  if ((route.requireCompany ?? true) && !input.ctx.companyId) throw badRequest("Select a company first");
  if (route.permission && !input.ctx.permissions.has(route.permission)) throw forbidden();

  return route.handler(input.ctx, { params, query: input.query, body: input.body });
}
