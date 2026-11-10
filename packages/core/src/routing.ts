import type { HttpMethod } from "./block.ts";

export interface RouteMatch<D> {
  route: D;
  params: Record<string, string>;
}

const METHODS = new Set<HttpMethod>(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function split(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/** Finds the route for e.g. ("POST", "/abc/invites") in a block's Routes. */
export function matchRoute<D>(routes: Record<string, D>, method: string, path: string): RouteMatch<D> | null {
  const want = split(path);
  for (const [key, definition] of Object.entries(routes)) {
    const space = key.indexOf(" ");
    const keyMethod = key.slice(0, space) as HttpMethod;
    if (!METHODS.has(keyMethod)) throw new Error(`Bad route key "${key}"`);
    if (keyMethod !== method) continue;
    const pattern = split(key.slice(space + 1));
    if (pattern.length !== want.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let index = 0; index < pattern.length; index++) {
      const part = pattern[index]!;
      const wanted = want[index]!;
      if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(wanted);
      else if (part !== wanted) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: definition, params };
  }
  return null;
}
