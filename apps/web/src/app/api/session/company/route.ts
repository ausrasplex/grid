// Company switcher: sets which company the user is acting as.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveAccess } from "@grid/block-companies";
import { getContext } from "@/lib/context";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/session";
import "@/blocks"; // ensures the app is configured before resolveAccess runs

const bodySchema = z.object({ companyId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_input", message: "companyId required" } }, { status: 400 });
  }
  // Only allow switching to a company the user is an active member of.
  const access = await resolveAccess(ctx.userId, parsed.data.companyId);
  if (!access) {
    return NextResponse.json({ error: { code: "forbidden", message: "You're not a member of that company" } }, { status: 403 });
  }

  const response = NextResponse.json({ companyId: parsed.data.companyId });
  response.cookies.set(ACTIVE_COMPANY_COOKIE, parsed.data.companyId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ companyId: null });
  response.cookies.delete(ACTIVE_COMPANY_COOKIE);
  return response;
}
