// Settings › Accounts & devices (server admin): everyone with an account on
// this server, their businesses, and the devices they're signed in on.
//   GET  the list (never session tokens)
import { NextResponse } from "next/server";
import { avatarUrl, db } from "@grid/db";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getContext } from "@/lib/context";

export async function GET() {
  const ctx = await getContext();
  if (!ctx?.user.serverAdmin) return NextResponse.json({ error: { code: "forbidden", message: "Only the server admin can see this" } }, { status: 403 });
  const current = await auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } });

  const users = await db.user.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      serverAdmin: true,
      avatarKey: true,
      image: true,
      createdAt: true,
      accounts: { select: { providerId: true, password: true } },
      memberships: { where: { status: { in: ["ACTIVE", "INVITED"] } }, select: { status: true, company: { select: { name: true } } } },
      sessions: {
        where: { expiresAt: { gt: new Date() } },
        orderBy: { updatedAt: "desc" },
        select: { id: true, userAgent: true, ipAddress: true, createdAt: true, updatedAt: true },
      },
    },
  });

  return NextResponse.json({
    accounts: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      serverAdmin: user.serverAdmin,
      avatarUrl: avatarUrl(user),
      createdAt: user.createdAt,
      // An invited person who hasn't set a password (or used Google / Microsoft) yet.
      canSignIn: user.accounts.some((account) => account.providerId !== "credential" || !!account.password),
      businesses: user.memberships.map((membership) => ({ name: membership.company.name, invited: membership.status === "INVITED" })),
      devices: user.sessions.map((session) => ({ ...session, current: session.id === current?.session.id })),
    })),
  });
}
