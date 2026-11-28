// Quick-route codes for QR codes and short links (docs/navigation.md §7).
// Random and unguessable; job and quote numbers never appear in links.

import { randomInt } from "node:crypto";
import type { Tx } from "./client";

/** No 0/O, 1/I/L or U, so codes read cleanly off a sticker. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Two groups of four, plus the server's INSTANCE_ID prefix when it has one. */
export function generateRouteCode(prefix = process.env.INSTANCE_ID): string {
  const pick = () => ALPHABET[randomInt(ALPHABET.length)];
  const group = () => Array.from({ length: 4 }, pick).join("");
  const body = `${group()}-${group()}`;
  return prefix ? `${prefix.toUpperCase()}-${body}` : body;
}

/** Codes are typed in sometimes: ignore case, spaces and missing dashes. */
export function normaliseRouteCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return raw.match(/.{1,4}/g)?.join("-") ?? "";
}

export interface RouteCodeTarget {
  blockId: string;
  entityType: string;
  entityId: string;
  companyId?: string | null;
  createdById?: string | null;
}

/** The current code for a thing, creating one the first time it's needed. */
export async function ensureRouteCode(tx: Tx, target: RouteCodeTarget): Promise<string> {
  const existing = await tx.routeCode.findFirst({
    where: { entityType: target.entityType, entityId: target.entityId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRouteCode();
    if (await tx.routeCode.findUnique({ where: { code } })) continue;
    await tx.routeCode.create({ data: { code, ...target } });
    return code;
  }
  throw new Error("Couldn't generate a unique route code");
}

/** The live code behind a link, or null if it's unknown, revoked or expired. */
export async function findRouteCode(tx: Tx, input: string) {
  const code = normaliseRouteCode(input);
  if (!code) return null;
  const row = await tx.routeCode.findUnique({ where: { code } });
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt < new Date())) return null;
  return row;
}

/** The public address for a code: PUBLIC_LINK_BASE/go/<code>, or this server's own address. */
/** The address links that leave Grid start with ("https://grid.example.com"): PUBLIC_LINK_BASE, else BETTER_AUTH_URL. */
export function publicBaseUrl(): string {
  return (process.env.PUBLIC_LINK_BASE || process.env.BETTER_AUTH_URL || "").replace(/\/$/, "");
}

export function routeCodeUrl(code: string): string {
  return `${publicBaseUrl()}/go/${code}`;
}

const CODE_RE = new RegExp(`^(?:[${ALPHABET}0-9]{2,8}-)?[${ALPHABET}]{4}-[${ALPHABET}]{4}$`);

/**
 * The route code in something the scanner read (docs/navigation.md §7a):
 * a /go/<code> link from any server, a tag address (tag.example.com.au/<code>),
 * or the code typed in. Null when it isn't one.
 */
export function codeFromScan(text: string): string | null {
  const raw = text.trim();
  let candidate = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parts = new URL(raw).pathname.split("/").filter(Boolean);
      if (parts.length === 2 && parts[0]!.toLowerCase() === "go") candidate = parts[1]!;
      else if (parts.length === 1) candidate = parts[0]!;
      else return null;
    } catch {
      return null;
    }
    candidate = decodeURIComponent(candidate);
  }
  // Typed in: case, spaces and missing dashes don't matter.
  const code = candidate.includes("-") ? candidate.toUpperCase().replace(/\s+/g, "") : normaliseRouteCode(candidate);
  return CODE_RE.test(code) ? code : null;
}
