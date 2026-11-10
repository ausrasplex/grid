// Public API: /api/public/<blockId>/<path>, for people who aren't signed
// in (a customer opening a quote link, someone checking a signed PDF).
// No session is read. Each block's publicRoutes decide what the token or
// code in the path allows. Only blocks a company could have on are here.

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { isHttpError, matchRoute } from "@grid/core";
import { registry } from "@/blocks";

type Params = { params: Promise<{ block: string; path?: string[] }> };

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

async function handle(request: NextRequest, { params }: Params) {
  const { block: blockId, path = [] } = await params;
  const load = registry.get(blockId)?.publicRoutes;
  if (!load) return errorResponse(404, "not_found", "Not found");
  const pathStr = "/" + path.join("/");
  const match = matchRoute(await load(), request.method, pathStr);
  if (!match) return errorResponse(404, "not_found", "Not found");

  const max = match.route.maxBytes ?? 64 * 1024;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > max) return errorResponse(413, "too_large", "That's too big to send");
  let body: unknown = null;
  let bytes: Uint8Array | null = null;
  if (request.method !== "GET" && request.method !== "DELETE") {
    const buffer = new Uint8Array(await request.arrayBuffer());
    if (buffer.byteLength > max) return errorResponse(413, "too_large", "That's too big to send");
    if ((request.headers.get("content-type") ?? "").includes("application/json")) {
      try {
        body = buffer.byteLength ? JSON.parse(new TextDecoder().decode(buffer)) : null;
      } catch {
        return errorResponse(400, "bad_json", "Request body isn't valid JSON");
      }
    } else if (buffer.byteLength) {
      bytes = buffer;
    }
  }

  try {
    const result = await match.route.handler({
      params: match.params,
      query: request.nextUrl.searchParams,
      body,
      bytes,
      ip: clientIp(request),
      userAgent: (request.headers.get("user-agent") ?? "").slice(0, 400),
    });
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? null, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (isHttpError(error)) return errorResponse(error.status, error.code, error.message);
    if (error instanceof ZodError || (error as Error)?.name === "ZodError") {
      const first = (error as ZodError).issues[0];
      return errorResponse(400, "invalid_input", first ? first.message : "Invalid input");
    }
    console.error(`[public api] ${request.method} /api/public/${blockId}${pathStr}`, error);
    return errorResponse(500, "server_error", "Something went wrong");
  }
}

export { handle as GET, handle as POST };
