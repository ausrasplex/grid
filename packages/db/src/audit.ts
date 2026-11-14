import type { Prisma } from "./generated/client";
import type { Tx } from "./client";

export interface AuditEntry {
  blockId: string;
  actorId: string | null;
  companyId?: string | null;
  projectId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  diff?: Prisma.InputJsonValue;
}

/** Where a change came from: the IP address and device of the request that made it. */
export interface AuditOrigin {
  ip: string | null;
  userAgent: string | null;
}

let originSource: (() => Promise<AuditOrigin | null>) | null = null;

/**
 * Tells audit() how to find the current request's IP and device. The app
 * sets it once at start-up (it reads the request headers), so no Block has
 * to pass them along. Returns null outside a request (background jobs).
 */
export function setAuditOrigin(source: () => Promise<AuditOrigin | null>): void {
  originSource = source;
}

async function currentOrigin(): Promise<AuditOrigin | null> {
  if (!originSource) return null;
  try {
    return await originSource();
  } catch {
    return null;
  }
}

/** Record a change. Call inside the same transaction as the change itself. */
export async function audit(tx: Tx, entry: AuditEntry): Promise<void> {
  const origin = await currentOrigin();
  await tx.auditLog.create({
    data: {
      blockId: entry.blockId,
      actorId: entry.actorId,
      companyId: entry.companyId ?? null,
      projectId: entry.projectId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      diff: entry.diff,
      ip: origin?.ip ?? null,
      userAgent: origin?.userAgent?.slice(0, 500) ?? null,
    },
  });
}
