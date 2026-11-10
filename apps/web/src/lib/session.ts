// Who is signed in, and which company they're acting as.
// Sign-in itself is Better Auth (lib/auth.ts); this file is the only
// place the rest of the app asks about it.

import "server-only";
import { cookies, headers } from "next/headers";
import { auth } from "./auth";

export const ACTIVE_COMPANY_COOKIE = "active-company";

export async function getSessionUserId(): Promise<string | null> {
  // Always check the database, so signing a device out (or a password
  // reset) takes effect on its very next request, not after the cookie
  // cache runs out.
  const session = await auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } });
  return session?.user.id ?? null;
}

export async function getActiveCompanyId(): Promise<string | null> {
  return (await cookies()).get(ACTIVE_COMPANY_COOKIE)?.value ?? null;
}
