// Single entry point for every block's API: /api/<blockId>/<path>.
// The core dispatcher checks the block is on for the active company and
// that the user has the route's permission before the handler runs.

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { dispatch, isHttpError } from "@grid/core";
import { registry } from "@/blocks";
import { getContext } from "@/lib/context";

type Params = { params: Promise<{ block: string; path?: string[] }> };

function errorResponse(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

async function handle(request: NextRequest, { params }: Params) {
  const { block: blockId, path = [] } = await params;

  const ctx = await getContext();
  if (!ctx) return errorResponse(401, "unauthorized", "Sign in required");

  let body: unknown = null;
  if (request.method !== "GET" && request.method !== "DELETE") {
    const text = await request.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return errorResponse(400, "bad_json", "Request body isn't valid JSON");
      }
    }
  }

  try {
    const result = await dispatch(registry, {
      blockId,
      method: request.method,
      path: "/" + path.join("/"),
      query: request.nextUrl.searchParams,
      body,
      ctx,
    });
    // A block can return a Response itself (a PDF, a file); anything else is JSON.
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? null);
  } catch (error) {
    if (isHttpError(error)) return errorResponse(error.status, error.code, error.message, error.details);
    // By name, not instanceof: each Block may bring its own copy of zod.
    if (error instanceof ZodError || (error as Error)?.name === "ZodError") {
      const issues = (error as ZodError).issues;
      const first = issues[0];
      const message = first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input";
      return errorResponse(400, "invalid_input", message, issues);
    }
    console.error(`[api] ${request.method} /api/${blockId}/${path.join("/")}`, error);
    return errorResponse(500, "server_error", "Something went wrong");
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
