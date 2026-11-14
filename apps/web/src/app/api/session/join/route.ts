// Uses a join link (/join/<token>): the way into a business without email.
//   Signed in as the invited person: accepts the invite.
//   Not signed in, no password yet: sets their name and password, signs them
//   in, accepts the invite. (Someone who already has a password signs in first.)
// Then the business becomes their active company.
import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { acceptInviteLink, inviteByLink } from "@grid/block-companies";
import { isHttpError } from "@grid/core";
import { audit, db } from "@grid/db";
import { auth } from "@/lib/auth";
import { ACTIVE_COMPANY_COOKIE, getSessionUserId } from "@/lib/session";
import "@/blocks"; // sets up the app (events, audit IP and device)

const bodySchema = z
  .object({
    token: z.string().min(10).max(100),
    name: z.string().trim().min(1, "Type your name").max(120).optional(),
    password: z.string().min(8, "Passwords need at least 8 characters").max(128).optional(),
  })
  .strict();

const fail = (status: number, message: string) => NextResponse.json({ error: { code: "invalid_input", message } }, { status });

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Check the details");
  const { token, name, password } = parsed.data;

  const invite = await inviteByLink(token);
  if (!invite) return fail(404, "This invite link has expired or was already used. Ask for a new one.");

  let userId = await getSessionUserId();
  if (!userId) {
    const credential = await db.account.findFirst({ where: { userId: invite.userId, providerId: "credential" }, select: { password: true } });
    if (credential?.password) return fail(400, "You already have a Grid password. Sign in to accept the invite.");
    // Already in another business here: the link alone mustn't set their password (it'd open that business too).
    if (await db.membership.count({ where: { userId: invite.userId, status: "ACTIVE" } })) {
      return fail(400, "You already use Grid with another business. Sign in to accept the invite.");
    }
    if (!name || !password) return fail(400, "Type your name and choose a password");
    const context = await auth.$context;
    const hash = await context.password.hash(password);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: invite.userId }, data: { name } });
      await audit(tx, { blockId: "users", actorId: invite.userId, entityType: "User", entityId: invite.userId, action: "joined_with_link", diff: { companyId: invite.companyId } });
    });
    if (credential) await context.internalAdapter.updateAccount((await db.account.findFirstOrThrow({ where: { userId: invite.userId, providerId: "credential" } })).id, { password: hash });
    else await context.internalAdapter.linkAccount({ userId: invite.userId, providerId: "credential", accountId: invite.userId, password: hash });
    // Signs them in on this device (sets the session cookie).
    await auth.api.signInEmail({ body: { email: invite.email, password, rememberMe: true }, headers: await headers() });
    userId = invite.userId;
  }

  try {
    const accepted = await acceptInviteLink(userId, token);
    const response = NextResponse.json({ companyId: accepted.companyId });
    response.cookies.set(ACTIVE_COMPANY_COOKIE, accepted.companyId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    if (isHttpError(error)) return fail(error.status, error.message);
    throw error;
  }
}
