// The one scanner's lookup (docs/navigation.md §7a): GET /api/scan?text=…
// returns { href } for what was read, or { href: null } ("Not recognised").
//   1. One of Grid's codes (a /go/<code> link, a tag address, or typed in):
//      the page it routes to. Like /go, this only routes: the page still checks access.
//   2. Otherwise each switched-on Block's scanLookup (an asset's own barcode).
//   3. Otherwise a link to a page on this server.

import { NextResponse, type NextRequest } from "next/server";
import { codeFromScan, db, findRouteCode } from "@grid/db";
import { registry } from "@/blocks";
import { getContext } from "@/lib/context";

export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: { code: "unauthorised", message: "Sign in required" } }, { status: 401 });
  const text = (request.nextUrl.searchParams.get("text") ?? "").trim().slice(0, 2000);
  if (!text) return NextResponse.json({ href: null });

  const code = codeFromScan(text);
  if (code) {
    const row = await findRouteCode(db, code);
    const target = row ? registry.routeTarget(row.entityType, row.entityId) : null;
    if (target) return NextResponse.json({ href: target });
  }

  for (const block of registry.blocks) {
    if (!block.scanLookup || !(block.required || ctx.enabledBlocks.has(block.id))) continue;
    try {
      const href = await (await block.scanLookup())(ctx, text);
      if (href) return NextResponse.json({ href });
    } catch (error) {
      console.error(`[scan] ${block.id} lookup failed`, error);
    }
  }

  // A link to one of this server's own pages.
  try {
    const url = new URL(text);
    if (url.origin === request.nextUrl.origin) return NextResponse.json({ href: `${url.pathname}${url.search}` });
  } catch {
    // Not a link.
  }
  return NextResponse.json({ href: null });
}
