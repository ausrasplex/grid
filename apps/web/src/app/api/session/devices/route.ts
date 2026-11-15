// Settings › Sign-in & devices: the devices you're signed in on.
//   GET     your devices, newest first; "current" marks this one
//   DELETE  { sessionId } one device, or { others: true } all but this one
//
// Not Better Auth's /list-sessions: that refuses ("session not fresh") once
// you signed in more than a day ago, which on your own phone is always.
// Ids only, never session tokens.
import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { audit, db } from "@grid/db";
import { auth } from "@/lib/auth";
import "@/blocks"; // sets up the app, so the audit entry gets the IP and device

const schema = z.union([z.object({ sessionId: z.string().uuid() }).strict(), z.object({ others: z.literal(true) }).strict()]);
const unauthorised = () => NextResponse.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });

async function currentSession() {
  return auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } });
}

export async function GET() {
  const current = await currentSession();
  if (!current) return unauthorised();
  const sessions = await db.session.findMany({
    where: { userId: current.user.id, expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ devices: sessions.map((session) => ({ ...session, current: session.id === current.session.id })) });
}

export async function DELETE(request: NextRequest) {
  const current = await currentSession();
  if (!current) return unauthorised();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_input", message: "Pick a device" } }, { status: 400 });
  const userId = current.user.id;

  const signedOut = await db.$transaction(async (tx) => {
    const where =
      "sessionId" in parsed.data
        ? { id: parsed.data.sessionId, userId, NOT: { id: current.session.id } }
        : { userId, NOT: { id: current.session.id } };
    const { count } = await tx.session.deleteMany({ where });
    if (count) {
      await audit(tx, {
        blockId: "users",
        actorId: userId,
        entityType: "User",
        entityId: userId,
        action: "sessionId" in parsed.data ? "device_signed_out" : "signed_out_everywhere",
        diff: { devices: count },
      });
    }
    return count;
  });
  return NextResponse.json({ signedOut });
}
