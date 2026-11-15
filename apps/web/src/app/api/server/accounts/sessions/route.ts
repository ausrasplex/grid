// Settings › Accounts & devices (server admin): sign devices out.
//   DELETE { sessionId }  that one device
//   DELETE { userId }     every device of that person
// The admin's own current device is never signed out from here (use
// Sign out in the menu). Takes effect on the device's very next request.
import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { audit, db } from "@grid/db";
import { auth } from "@/lib/auth";
import { getContext } from "@/lib/context";
import "@/blocks"; // sets up the app, so the audit entry gets the IP and device

const schema = z.union([z.object({ sessionId: z.string().uuid() }).strict(), z.object({ userId: z.string().uuid() }).strict()]);

export async function DELETE(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx?.user.serverAdmin) return NextResponse.json({ error: { code: "forbidden", message: "Only the server admin can do this" } }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_input", message: "Pick a device or a person" } }, { status: 400 });
  const current = await auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } });
  const keep = current?.session.id ?? "";

  const signedOut = await db.$transaction(async (tx) => {
    if ("sessionId" in parsed.data) {
      if (parsed.data.sessionId === keep) return 0;
      const session = await tx.session.findUnique({ where: { id: parsed.data.sessionId }, select: { userId: true, userAgent: true, ipAddress: true } });
      if (!session) return 0;
      await tx.session.delete({ where: { id: parsed.data.sessionId } });
      await audit(tx, {
        blockId: "users",
        actorId: ctx.userId,
        entityType: "User",
        entityId: session.userId,
        action: "device_signed_out",
        diff: { device: session.userAgent, ip: session.ipAddress },
      });
      return 1;
    }
    const { count } = await tx.session.deleteMany({ where: { userId: parsed.data.userId, id: { not: keep } } });
    if (count) {
      await audit(tx, { blockId: "users", actorId: ctx.userId, entityType: "User", entityId: parsed.data.userId, action: "signed_out_everywhere", diff: { devices: count } });
    }
    return count;
  });
  return NextResponse.json({ signedOut });
}
