// Adds a password to an account that doesn't have one yet: people who
// were invited and signed in with an emailed link. Changing an existing
// password goes through Better Auth's own /api/auth/change-password.
import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";

const bodySchema = z.object({ newPassword: z.string().min(8).max(128) }).strict();

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_input", message: "Passwords need at least 8 characters" } }, { status: 400 });
  }
  try {
    await auth.api.setPassword({ body: parsed.data, headers: await headers() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode ?? 400;
    const message = (error as Error).message || "Couldn't set the password";
    return NextResponse.json({ error: { code: "auth_error", message } }, { status });
  }
}
