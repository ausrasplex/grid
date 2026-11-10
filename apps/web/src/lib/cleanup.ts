// The storage clean-up (docs/photos-block.md, "Storage clean-up").
//
//   1. Uploads never filed against a job, after `unfiledDays`.
//   2. What people deleted, once Recently deleted has run out (`deletedDays`):
//      each Block with a `cleanup` hook purges its own records.
//   3. Once a week: files on disk the database doesn't know about.
//
// Every run is written to the clean-up history. In dry-run mode the history
// shows what would have gone, and nothing is removed.

import "server-only";
import {
  db,
  findStrayFiles,
  getStorageSettings,
  purgeStoredFile,
  removeStrayFile,
  storedBytes,
  storedKeys,
  summarise,
  type CleanupItemInput,
  type Prisma,
} from "@grid/db";
import { registry } from "@/blocks";

const DAY = 86_400_000;

const day = (date: Date) => date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export interface RunResult {
  ran: boolean;
  reason?: string;
  runId?: string;
  count?: number;
  bytes?: number;
  dryRun?: boolean;
}

export async function runCleanup(options: { trigger: "schedule" | "manual"; userId?: string | null }): Promise<RunResult> {
  const settings = await getStorageSettings();
  if (settings.mode === "off" && options.trigger === "schedule") return { ran: false, reason: "Clean-up is switched off" };
  const dryRun = settings.mode !== "on";

  // One clean-up at a time ("Run now" during the nightly run). A run that
  // never finished (server stopped part-way) stops counting after 30 minutes.
  const running = await db.cleanupRun.findFirst({
    where: { finishedAt: null, trigger: { not: "delete-now" }, startedAt: { gt: new Date(Date.now() - 30 * 60_000) } },
  });
  if (running) return { ran: false, reason: "A clean-up is already running" };

  const run = await db.cleanupRun.create({
    data: { trigger: options.trigger, mode: dryRun ? "dry-run" : "on", triggeredById: options.userId ?? null },
  });
  const items: CleanupItemInput[] = [];
  try {
    const now = Date.now();

    // 1. Uploads never filed against a job.
    const unfiled = await db.storedFile.findMany({
      where: { blockId: null, deletedAt: null, purgedAt: null, createdAt: { lt: new Date(now - settings.unfiledDays * DAY) } },
      take: 5000,
    });
    const names = new Map(
      (await db.user.findMany({ where: { id: { in: unfiled.map((file) => file.createdById ?? "") } }, select: { id: true, name: true } })).map((user) => [user.id, user.name]),
    );
    for (const file of unfiled) {
      const bytes = dryRun ? storedBytes(file) : await db.$transaction((tx) => purgeStoredFile(tx, file.id));
      items.push({
        companyId: file.companyId,
        kind: "unfiled",
        label: `Unfiled upload${file.originalName ? ` "${file.originalName}"` : ""} by ${names.get(file.createdById ?? "") ?? "someone"}, uploaded ${day(file.createdAt)}`,
        refId: file.id,
        bytes,
      });
    }

    // 2. Recently deleted has run out: each Block purges its own.
    for (const block of registry.blocks) {
      if (!block.cleanup) continue;
      const hook = await block.cleanup();
      items.push(...(await hook.purgeDeleted({ before: new Date(now - settings.deletedDays * DAY), dryRun })));
    }

    // 3. Weekly: stray files on disk (a crash part-way through an upload, .tmp files).
    const lastSweep = await db.cleanupRun.findFirst({
      where: { id: { not: run.id }, finishedAt: { not: null }, summary: { path: ["swept"], equals: true } },
      orderBy: { startedAt: "desc" },
    });
    const sweep = options.trigger === "manual" || !lastSweep || now - lastSweep.startedAt.getTime() > 6.5 * DAY;
    if (sweep) {
      const known = new Set<string>();
      let cursor: string | undefined;
      for (;;) {
        const page = await db.storedFile.findMany({ where: { purgedAt: null }, select: { id: true, key: true, variants: true }, orderBy: { id: "asc" }, take: 2000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
        for (const file of page) for (const storedKey of storedKeys(file)) known.add(storedKey);
        if (page.length < 2000) break;
        cursor = page.at(-1)!.id;
      }
      for (const stray of await findStrayFiles(known, new Date(now - DAY))) {
        if (!dryRun) await removeStrayFile(stray.key);
        items.push({ companyId: null, kind: "stray", label: `File on disk with no record: ${stray.key}`, refId: null, bytes: stray.bytes });
      }
    }

    const summary = { ...summarise(items), swept: sweep };
    await db.cleanupRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        summary: summary as unknown as Prisma.InputJsonValue,
        items: { create: items.map((item) => ({ ...item, refId: item.refId ?? null, applied: !dryRun })) },
      },
    });
    console.log(`[cleanup] ${options.trigger}${dryRun ? " (dry run)" : ""}: ${items.length} item(s), ${summary.bytes} bytes`);
    return { ran: true, runId: run.id, count: items.length, bytes: summary.bytes, dryRun };
  } catch (error) {
    console.error("[cleanup] failed", error);
    await db.cleanupRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        error: (error as Error).message.slice(0, 1000),
        summary: summarise(items) as unknown as Prisma.InputJsonValue,
        items: { create: items.map((item) => ({ ...item, refId: item.refId ?? null, applied: !dryRun })) },
      },
    });
    return { ran: true, runId: run.id, count: items.length, reason: (error as Error).message, dryRun };
  }
}

/**
 * Called every 15 minutes. Runs the nightly clean-up once the configured
 * time has passed today and it hasn't run since, so a server that was off
 * at 2:30 catches up when it starts.
 */
export async function cleanupTick(now = new Date()): Promise<RunResult | null> {
  const { time, mode } = await getStorageSettings();
  if (mode === "off") return null;
  const [hour, minute] = time.split(":").map(Number);
  const due = new Date(now);
  due.setHours(hour!, minute!, 0, 0);
  if (now < due) return null;
  const last = await db.cleanupRun.findFirst({ where: { trigger: "schedule" }, orderBy: { startedAt: "desc" } });
  if (last && last.startedAt >= due) return null;
  return runCleanup({ trigger: "schedule" });
}
