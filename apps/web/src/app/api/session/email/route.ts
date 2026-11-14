// Changes your own sign-in email (Settings › Profile). Anyone can change
// theirs, the Owner included. You confirm with your current password, so a
// phone left signed in can't be used to take the account over. The old
// address gets a heads-up email when the server has email set up.
//
// Not Better Auth's /change-email: that needs email verification set up and
// quietly reports success when the new address is already taken.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { audit, db } from "@grid/db";
import { auth } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session";
import { sendMail } from "@/lib/mail";
import "@/blocks"; // sets up the app, so the audit entry gets the IP and device

const bodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Check the email address").max(254),
    password: z.string().max(128).default(""),
  })
  .strict();

const fail = (status: number, message: string) => NextResponse.json({ error: { code: status === 401 ? "unauthorized" : "invalid_input", message } }, { status });

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return fail(401, "Sign in required");

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Check the email address");
  const { email, password } = parsed.data;

  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (email === user.email.toLowerCase()) return fail(400, "That's already your email");

  // Prove it's you: your current password.
  const credential = await db.account.findFirst({ where: { userId, providerId: "credential" }, select: { password: true } });
  if (!credential?.password) {
    return fail(400, "Set a password first (Settings › Sign-in & devices), then change your email.");
  }
  const context = await auth.$context;
  if (!password || !(await context.password.verify({ hash: credential.password, password }))) {
    return fail(400, "That password isn't right");
  }

  if (await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, id: { not: userId } }, select: { id: true } })) {
    return fail(400, "Another account already uses that email");
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { email, emailVerified: false } });
    await audit(tx, { blockId: "users", actorId: userId, entityType: "User", entityId: userId, action: "email_changed", diff: { from: user.email, to: email } });
  });

  // Let the old address know (a sign of trouble if it wasn't them). Never blocks the change.
  await sendMail({
    to: user.email,
    subject: "Your Grid email was changed",
    text: `Hi ${user.name},\n\nThe email you sign in to Grid with was changed to ${email}. From now on, sign in with that address.\n\nIf you didn't do this, contact your Grid server admin straight away.`,
  }).catch((error) => console.error("[account] couldn't tell the old address about the email change", error));

  return NextResponse.json({ email });
}
