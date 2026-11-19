// The storage clean-up (docs/photos-block.md, "Storage clean-up").
//
//   1. Uploads never filed against a job, after `unfiledDays`.
//   2. What people deleted, once Recently deleted has run out (`deletedDays`):
//      each Block with a `cleanup` hook purges its own records.
//      Also: archived jobs' copies drawn again for a quick look and not
//      opened for `archivedCopyDays` (each Block's dropArchivedCopies).
//      Also: jobs deleted (archived jobs only) before that, through every
//      Block's purgeProject hook, then the files they return
//      (docs/stage-2-projects.md "Deleting a job").
//   3. Businesses deleted before that (docs/roadmap.md "Deleting a business"):
//      every Block's purgeCompany hook, then all their files (not people's
//      Wallet photos, which belong to the person), route codes and log.
//   4. Once a week: files on disk the database doesn't know about.
//
// Every run is written to the clean-up history. In dry-run mode the history
// shows what would have gone, and nothing is removed.

import "server-only";
import { companiesToPurge, companyUsage, purgeCompanyRecords } from "@grid/block-companies";
import { jobsToPurge } from "@grid/block-projects";
import {
  audit,
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
      if (hook.purgeDeleted) items.push(...(await hook.purgeDeleted({ before: new Date(now - settings.deletedDays * DAY), dryRun })));
      // Archived jobs: copies drawn again for a quick look, not opened since (phase 2e).
      if (hook.dropArchivedCopies) items.push(...(await hook.dropArchivedCopies({ openedBefore: new Date(now - settings.archivedCopyDays * DAY), dryRun })));
    }

    // 2b. Jobs deleted before Recently deleted ran out: removed for good.
    for (const job of await jobsToPurge(new Date(now - settings.deletedDays * DAY))) {
      // The size, from each Block's job storage (what the Storage section shows).
      let bytes = 0;
      for (const block of registry.blocks) {
        if (!block.jobStorage) continue;
        for (const line of await (await block.jobStorage())(job.hostCompanyId, [job.id])) bytes += line.originalBytes + line.copyBytes + line.deletedBytes;
      }
      items.push({
        companyId: job.hostCompanyId,
        kind: "deleted-job",
        label: `Job ${[job.jobNumber, job.name].filter(Boolean).join(" ")}, deleted ${day(job.deletedAt!)}`,
        refId: job.id,
        bytes,
      });
      if (dryRun) continue;
      // Dependent Blocks first (markups before plans before jobs).
      const fileIds: string[] = [];
      for (const block of [...registry.blocks].reverse()) {
        if (!block.cleanup) continue;
        const hook = await block.cleanup();
        if (hook.purgeProject) fileIds.push(...(await hook.purgeProject(job.id, job.hostCompanyId)));
      }
      const files = await db.storedFile.findMany({ where: { id: { in: [...new Set(fileIds)] }, companyId: job.hostCompanyId, purgedAt: null }, select: { id: true } });
      for (const file of files) await db.$transaction((tx) => purgeStoredFile(tx, file.id));
      await db.$transaction((tx) =>
        audit(tx, { blockId: "projects", actorId: options.userId ?? null, companyId: job.hostCompanyId, entityType: "Project", entityId: job.id, action: "removed_for_good", diff: { name: job.name, jobNumber: job.jobNumber } }),
      );
    }

    // 3. Businesses deleted before Recently deleted ran out: removed for good.
    for (const company of await companiesToPurge(new Date(now - settings.deletedDays * DAY))) {
      // Wallet photos are the person's, not the business's: they stay.
      const files = await db.storedFile.findMany({
        where: { companyId: company.id, purgedAt: null, OR: [{ blockId: null }, { blockId: { not: "credentials" } }] },
      });
      const usage = (await companyUsage(company.id)).map((entry) => entry.words).join(", ");
      items.push({
        companyId: company.id,
        kind: "deleted-business",
        label: `${company.name}, deleted ${day(company.deletedAt!)}${usage ? ` (${usage})` : ""}`,
        refId: company.id,
        bytes: files.reduce((total, file) => total + storedBytes(file), 0),
      });
      if (dryRun) continue;
      // Dependent Blocks first (markups before plans before jobs before sites).
      for (const block of [...registry.blocks].reverse()) {
        if (!block.cleanup) continue;
        const hook = await block.cleanup();
        if (hook.purgeCompany) await hook.purgeCompany(company.id);
      }
      for (const file of files) await db.$transaction((tx) => purgeStoredFile(tx, file.id));
      await db.$transaction(async (tx) => {
        await tx.routeCode.deleteMany({ where: { companyId: company.id } });
        await tx.auditLog.deleteMany({ where: { companyId: company.id } });
      });
      await purgeCompanyRecords(company.id);
      await db.$transaction((tx) =>
        audit(tx, { blockId: "companies", actorId: options.userId ?? null, companyId: company.id, entityType: "Company", entityId: company.id, action: "removed_for_good", diff: { name: company.name } }),
      );
    }

    // 4. Weekly: stray files on disk (a crash part-way through an upload, .tmp files).
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
      // Profile pictures live outside StoredFile (User.avatarKey).
      for (const user of await db.user.findMany({ where: { avatarKey: { not: null } }, select: { avatarKey: true } })) known.add(user.avatarKey!);
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
