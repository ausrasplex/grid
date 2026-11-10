// Backups (docs/backups.md). Each backup is a folder under BACKUPS_ROOT:
//
//   2026-11-07_0300_ab12cd34/
//     database.dump    pg_dump custom format (if the database is included)
//     files/           a snapshot of the files share (if media is included)
//     secrets.env      the sign-in secret and encryption key
//     manifest.json    Grid version, migrations, sizes, checksum
//
// Media snapshots hard-link files that haven't changed since the previous
// backup, so each backup restores as a complete copy but only new photos
// take extra space.

import "server-only";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, link, lstat, mkdir, readFile, readdir, rm, stat, statfs, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { CACHE_DIR, audit, db, filesRoot, getBackupSettings, lastDue } from "@grid/db";
import pkg from "../../package.json";

const HOUR = 3_600_000;

export function backupsRoot(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.BACKUPS_ROOT || "./data/backups");
}

const pad = (value: number) => String(value).padStart(2, "0");
function folderName(date: Date, id: string) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}_${id.slice(0, 8)}`;
}

export class BackupError extends Error {
  override name = "BackupError";
}

// ---------------------------------------------------------------------
// Starting a backup
// ---------------------------------------------------------------------

/**
 * Checks a backup can start, and records it as running. The work itself is
 * done by executeBackup(), on the job runner, so the page answers at once.
 */
export async function createBackup(input: { trigger: "schedule" | "manual"; userId?: string | null; includeDatabase: boolean; includeMedia: boolean }) {
  if (!input.includeDatabase && !input.includeMedia) throw new BackupError("Tick the database, the media, or both");
  const running = await db.backupRun.findFirst({ where: { status: "running", startedAt: { gt: new Date(Date.now() - 12 * HOUR) } } });
  if (running) throw new BackupError("A backup is already running");

  const root = backupsRoot();
  await mkdir(/*turbopackIgnore: true*/ root, { recursive: true });

  const startedAt = new Date();
  const run = await db.backupRun.create({
    data: {
      trigger: input.trigger,
      triggeredById: input.userId ?? null,
      includesDb: input.includeDatabase,
      includesMedia: input.includeMedia,
      folder: "pending",
      startedAt,
    },
  });
  const folder = folderName(startedAt, run.id);
  await db.backupRun.update({ where: { id: run.id }, data: { folder } });

  // Room for it? At least the last backup's new data, plus 10%.
  const last = await db.backupRun.findFirst({ where: { status: "done" }, orderBy: { startedAt: "desc" } });
  if (last) {
    const need = Number(last.dbBytes + last.newMediaBytes) * 1.1;
    const disk = await statfs(/*turbopackIgnore: true*/ root);
    const free = disk.bavail * disk.bsize;
    if (free < need) {
      await db.backupRun.update({
        where: { id: run.id },
        data: { status: "failed", finishedAt: new Date(), error: `Not enough free space on the backups share (${Math.round(free / 1e6)} MB free, about ${Math.round(need / 1e6)} MB needed)` },
      });
      throw new BackupError("Not enough free space on the backups share");
    }
  }
  return { id: run.id, folder };
}

// ---------------------------------------------------------------------
// Doing the work
// ---------------------------------------------------------------------

/** pg_dump of the whole database (except pg-boss's queue, which rebuilds itself). */
async function dumpDatabase(out: string) {
  const url = new URL(process.env.DATABASE_URL!);
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  };
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--exclude-schema=pgboss", `--file=${out}`], { env });
    let error = "";
    child.stderr.on("data", (event) => (error += event));
    child.on("error", (event) => reject(new BackupError(`pg_dump couldn't start: ${event.message}`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new BackupError(`pg_dump failed: ${error.trim().slice(0, 500)}`))));
  });
}

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(/*turbopackIgnore: true*/ file)
      .on("data", (event) => hash.update(event))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

/**
 * Copies the files share into `dest`. A file with the same size and time as
 * in the previous snapshot becomes a hard link to it instead of a copy.
 */
async function snapshot(source: string, dest: string, previous: string | null) {
  let files = 0;
  let bytes = 0;
  let newBytes = 0;
  async function walk(relativePath: string) {
    let entries;
    try {
      entries = await readdir(/*turbopackIgnore: true*/ path.join(source, relativePath), { withFileTypes: true });
    } catch {
      return; // no files share yet
    }
    await mkdir(/*turbopackIgnore: true*/ path.join(dest, relativePath), { recursive: true });
    for (const entry of entries) {
      const childPath = path.join(relativePath, entry.name);
      if (relativePath === "" && entry.name === CACHE_DIR) continue; // plan tiles etc. are made again from the originals
      if (entry.isDirectory()) {
        await walk(childPath);
        continue;
      }
      if (!entry.isFile() || entry.name.endsWith(".tmp")) continue;
      const from = path.join(source, childPath);
      const to = path.join(dest, childPath);
      const stats = await stat(/*turbopackIgnore: true*/ from);
      files++;
      bytes += stats.size;
      if (previous) {
        try {
          const previousStats = await stat(/*turbopackIgnore: true*/ path.join(previous, childPath));
          if (previousStats.size === stats.size && Math.abs(previousStats.mtimeMs - stats.mtimeMs) < 1000) {
            await link(/*turbopackIgnore: true*/ path.join(previous, childPath), to);
            continue;
          }
        } catch {
          /* not in the last backup, or hard links not allowed here: copy it */
        }
      }
      await copyFile(/*turbopackIgnore: true*/ from, to);
      await utimes(/*turbopackIgnore: true*/ to, stats.atime, stats.mtime);
      newBytes += stats.size;
    }
  }
  await walk("");
  return { files, bytes, newBytes };
}

/** Does the backup recorded by createBackup(). Never throws: failures are written to the run. */
export async function executeBackup(runId: string): Promise<void> {
  const run = await db.backupRun.findUnique({ where: { id: runId } });
  if (!run || run.status !== "running") return;
  const directory = path.join(backupsRoot(), run.folder);
  try {
    await mkdir(/*turbopackIgnore: true*/ directory, { recursive: true });
    const manifest: Record<string, unknown> = {
      grid: pkg.version,
      createdAt: run.startedAt.toISOString(),
      includes: { database: run.includesDb, media: run.includesMedia },
    };

    let dbBytes = 0;
    if (run.includesDb) {
      const out = path.join(directory, "database.dump");
      await dumpDatabase(out);
      dbBytes = (await stat(/*turbopackIgnore: true*/ out)).size;
      const migrations = await db.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`;
      const [companies, users, jobs, photos] = await Promise.all([db.company.count(), db.user.count(), db.project.count(), db.storedFile.count({ where: { purgedAt: null } })]);
      manifest.database = { file: "database.dump", bytes: dbBytes, sha256: await sha256(out) };
      manifest.migrations = migrations.map((migration) => migration.migration_name);
      manifest.counts = { businesses: companies, people: users, jobs, files: photos };
    }

    let media = { files: 0, bytes: 0, newBytes: 0 };
    if (run.includesMedia) {
      const previousRun = await db.backupRun.findFirst({
        where: { status: "done", includesMedia: true, deletedAt: null, id: { not: run.id } },
        orderBy: { startedAt: "desc" },
      });
      media = await snapshot(filesRoot(), path.join(directory, "files"), previousRun ? path.join(backupsRoot(), previousRun.folder, "files") : null);
      manifest.media = { folder: "files", files: media.files, bytes: media.bytes };
    }

    // The keys, so a restore on a new server can still read saved passwords.
    const secrets = path.join(directory, "secrets.env");
    await writeFile(
      /*turbopackIgnore: true*/ secrets,
      `BETTER_AUTH_SECRET=${process.env.BETTER_AUTH_SECRET ?? ""}\nAPP_ENCRYPTION_KEY=${process.env.APP_ENCRYPTION_KEY ?? ""}\n`,
    );
    await chmod(/*turbopackIgnore: true*/ secrets, 0o600);
    await writeFile(/*turbopackIgnore: true*/ path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2));

    await db.backupRun.update({
      where: { id: runId },
      data: {
        status: "done",
        finishedAt: new Date(),
        dbBytes: BigInt(dbBytes),
        mediaBytes: BigInt(media.bytes),
        mediaFiles: media.files,
        newMediaBytes: BigInt(media.newBytes),
      },
    });
    await audit(db, { blockId: "core", actorId: run.triggeredById, entityType: "Backup", entityId: runId, action: "created", diff: { folder: run.folder, dbBytes, mediaBytes: media.bytes } });
    console.log(`[backup] ${run.folder} done: database ${dbBytes} bytes, ${media.files} files (${media.newBytes} bytes new)`);
    await applyRetention();
  } catch (error) {
    console.error("[backup] failed", error);
    await rm(/*turbopackIgnore: true*/ directory, { recursive: true, force: true }).catch(() => {});
    await db.backupRun.update({
      where: { id: runId },
      data: { status: "failed", finishedAt: new Date(), error: (error as Error).message.slice(0, 1000) },
    });
  }
}

/** Keep the latest N finished backups (pinned ones don't count); remove older ones. */
export async function applyRetention() {
  const { keep } = await getBackupSettings();
  const done = await db.backupRun.findMany({
    where: { status: "done", deletedAt: null, pinned: false },
    orderBy: { startedAt: "desc" },
  });
  for (const old of done.slice(keep)) await removeBackup(old.id, null, "replaced");
}

export async function removeBackup(id: string, userId: string | null, reason: "replaced" | "deleted") {
  const run = await db.backupRun.findUnique({ where: { id } });
  if (!run || run.deletedAt || run.status === "running") return;
  await rm(/*turbopackIgnore: true*/ path.join(backupsRoot(), run.folder), { recursive: true, force: true });
  await db.backupRun.update({ where: { id }, data: { deletedAt: new Date(), deletedById: userId } });
  await audit(db, { blockId: "core", actorId: userId, entityType: "Backup", entityId: id, action: reason, diff: { folder: run.folder } });
}

/**
 * Backups still marked running when Grid starts. Two cases:
 *  - Grid restarted part-way through: no manifest.json yet, so it's removed.
 *  - The database was restored from this very backup (the dump is taken
 *    while the backup is still "running"): its folder is complete, with a
 *    manifest, so it's marked done and kept. Never delete a finished backup.
 */
export async function failInterruptedBackups() {
  const stuck = await db.backupRun.findMany({ where: { status: "running" } });
  for (const run of stuck) {
    const directory = path.join(backupsRoot(), run.folder);
    let manifest: { database?: { bytes?: number }; media?: { files?: number; bytes?: number } } | null = null;
    try {
      manifest = JSON.parse(await readFile(/*turbopackIgnore: true*/ path.join(directory, "manifest.json"), "utf8"));
    } catch {
      /* not finished */
    }
    if (manifest) {
      await db.backupRun.update({
        where: { id: run.id },
        data: {
          status: "done",
          finishedAt: run.finishedAt ?? new Date(),
          dbBytes: BigInt(manifest.database?.bytes ?? 0),
          mediaBytes: BigInt(manifest.media?.bytes ?? 0),
          mediaFiles: manifest.media?.files ?? 0,
        },
      });
      continue;
    }
    await rm(/*turbopackIgnore: true*/ directory, { recursive: true, force: true }).catch(() => {});
    await db.backupRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date(), error: "Grid restarted part-way through the backup" } });
  }
}

/** Called every 15 minutes: starts the scheduled backup once it's due. */
export async function backupTick(now = new Date()) {
  const settings = await getBackupSettings();
  const due = lastDue(settings, now);
  if (!due) return;
  const last = await db.backupRun.findFirst({ where: { trigger: "schedule" }, orderBy: { startedAt: "desc" } });
  if (last && last.startedAt >= due) return;
  try {
    const run = await createBackup({ trigger: "schedule", includeDatabase: settings.includeDatabase, includeMedia: settings.includeMedia });
    await executeBackup(run.id);
  } catch (error) {
    console.error("[backup] scheduled backup didn't start:", (error as Error).message);
  }
}

/** Space the backups use on disk, counting hard-linked files once. */
export async function backupsUsage() {
  const root = backupsRoot();
  const seen = new Set<string>();
  let bytes = 0;
  async function walk(directory: string) {
    let entries;
    try {
      entries = await readdir(/*turbopackIgnore: true*/ directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const stats = await lstat(/*turbopackIgnore: true*/ full);
        const key = `${stats.dev}:${stats.ino}`;
        if (!seen.has(key)) {
          seen.add(key);
          bytes += stats.size;
        }
      }
    }
  }
  await walk(root);
  let disk: { free: number; total: number } | null = null;
  try {
    const diskStats = await statfs(/*turbopackIgnore: true*/ root);
    disk = { free: diskStats.bavail * diskStats.bsize, total: diskStats.blocks * diskStats.bsize };
  } catch {
    /* folder not made yet */
  }
  return { bytes, disk };
}

/** Streams a backup folder as one .tar (busybox/GNU tar), so big backups never fill memory or disk. */
export function tarStream(folder: string): ReadableStream<Uint8Array> {
  const child = spawn("tar", ["-cf", "-", "-C", backupsRoot(), folder]);
  return new ReadableStream({
    start(controller) {
      child.stdout.on("data", (event: Buffer) => controller.enqueue(new Uint8Array(event)));
      child.stdout.on("end", () => controller.close());
      child.on("error", (event) => controller.error(event));
    },
    cancel() {
      child.kill();
    },
  });
}
