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

/** Record a change. Call inside the same transaction as the change itself. */
export async function audit(tx: Tx, entry: AuditEntry): Promise<void> {
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
    },
  });
}
