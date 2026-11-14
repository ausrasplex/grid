// The IP address and device a request came from, for the audit log and the
// customer signing record. Behind a Cloudflare Tunnel the visitor's address
// is in CF-Connecting-IP; behind another proxy, the first X-Forwarded-For.
import "server-only";
import { headers } from "next/headers";
import type { AuditOrigin } from "@grid/db";

export function clientIp(requestHeaders: Headers): string | null {
  const cloudflare = requestHeaders.get("cf-connecting-ip");
  if (cloudflare) return cloudflare.trim();
  const forwarded = requestHeaders.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || null;
  return requestHeaders.get("x-real-ip")?.trim() || null;
}

/** The current request's IP and device, or null outside a request (background jobs). */
export async function requestOrigin(): Promise<AuditOrigin | null> {
  const requestHeaders = await headers();
  return { ip: clientIp(requestHeaders), userAgent: requestHeaders.get("user-agent") };
}
