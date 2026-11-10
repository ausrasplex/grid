// The clean-up history (Settings › Storage). Every removal is written
// here, whether by the nightly run, "Run clean-up now" or a manager's
// "Delete now", so owners can see what went and when.

import { db, type Tx } from "./client";
import type { Prisma } from "./generated/client";

export interface CleanupItemInput {
  companyId: string | null;
  kind: "unfiled" | "deleted-photo" | "deleted-note" | "deleted-plan" | "stray";
  label: string;
  refId?: string | null;
  bytes: number;
}

export function summarise(items: CleanupItemInput[]) {
  const by: Record<string, { count: number; bytes: number }> = {};
  for (const item of items) {
    by[item.kind] ??= { count: 0, bytes: 0 };
    by[item.kind]!.count++;
    by[item.kind]!.bytes += item.bytes;
  }
  return { byKind: by, count: items.length, bytes: items.reduce((total, item) => total + item.bytes, 0) };
}

/** Writes a finished run with its items in one go (used by Delete now). */
export async function recordCleanup(
  input: { trigger: "schedule" | "manual" | "delete-now"; mode: "on" | "dry-run"; userId?: string | null; items: CleanupItemInput[] },
  tx: Tx = db,
) {
  return tx.cleanupRun.create({
    data: {
      trigger: input.trigger,
      mode: input.mode,
      triggeredById: input.userId ?? null,
      finishedAt: new Date(),
      summary: summarise(input.items) as unknown as Prisma.InputJsonValue,
      items: { create: input.items.map((item) => ({ ...item, refId: item.refId ?? null, applied: input.mode === "on" })) },
    },
  });
}
