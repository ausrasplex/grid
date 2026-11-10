// Settings › Backups (server admin only).
//   GET    /api/backups                  history, next scheduled time, space used
//   GET    /api/backups/settings
//   PUT    /api/backups/settings
//   POST   /api/backups/run              { includeDatabase, includeMedia } Back up now
//   POST   /api/backups/<id>/pin         { pinned }
//   DELETE /api/backups/<id>
//   GET    /api/backups/<id>/download    the backup as one .tar

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { audit, db, getBackupSettings, nextDue, setBackupSettings } from "@grid/db";
import { getContext } from "@/lib/context";
import { applyRetention, backupsUsage, createBackup, removeBackup, tarStream } from "@/lib/backups";
import { enqueueBackup } from "@/lib/jobs";

const errorResponse = (status: number, message: string) => NextResponse.json({ error: { code: status === 403 ? "forbidden" : "invalid_input", message } }, { status });

const settingsSchema = z
  .object({
    includeDatabase: z.boolean(),
    includeMedia: z.boolean(),
    schedule: z.enum(["off", "daily", "weekly"]),
    day: z.number().int().min(0).max(6),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time, e.g. 03:00"),
    keep: z.number().int().min(1).max(100),
  })
  .strict()
  .refine((value) => value.schedule === "off" || value.includeDatabase || value.includeMedia, "Tick the database, the media, or both");

async function handle(request: NextRequest, path: string[]) {
  const ctx = await getContext();
  if (!ctx) return errorResponse(401, "Sign in required");
  if (!ctx.user.serverAdmin) return errorResponse(403, "Only the server admin can manage backups");
  const [section, action] = path;

  if (request.method === "GET" && !section) {
    const [runs, settings, usage] = await Promise.all([
      db.backupRun.findMany({ orderBy: { startedAt: "desc" }, take: 100 }),
      getBackupSettings(),
      backupsUsage(),
    ]);
    const names = new Map(
      (await db.user.findMany({ where: { id: { in: runs.map((run) => run.triggeredById ?? "") } }, select: { id: true, name: true } })).map((user) => [user.id, user.name]),
    );
    return NextResponse.json({
      next: nextDue(settings, new Date()),
      usage,
      runs: runs.map((run) => ({
        id: run.id,
        trigger: run.trigger,
        by: run.triggeredById ? (names.get(run.triggeredById) ?? "Someone") : null,
        includesDb: run.includesDb,
        includesMedia: run.includesMedia,
        status: run.status,
        folder: run.folder,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        dbBytes: Number(run.dbBytes),
        mediaBytes: Number(run.mediaBytes),
        mediaFiles: run.mediaFiles,
        newMediaBytes: Number(run.newMediaBytes),
        error: run.error,
        pinned: run.pinned,
        deletedAt: run.deletedAt,
      })),
    });
  }

  if (section === "settings") {
    if (request.method === "GET") return NextResponse.json(await getBackupSettings());
    if (request.method === "PUT") {
      const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return errorResponse(400, parsed.error.issues[0]?.message ?? "Check the settings");
      await setBackupSettings(parsed.data, ctx.userId);
      await applyRetention(); // a smaller "keep" applies straight away
      return NextResponse.json(parsed.data);
    }
  }

  if (section === "run" && request.method === "POST") {
    const body = z.object({ includeDatabase: z.boolean(), includeMedia: z.boolean() }).strict().safeParse(await request.json().catch(() => null));
    if (!body.success) return errorResponse(400, "Tick the database, the media, or both");
    try {
      const run = await createBackup({ trigger: "manual", userId: ctx.userId, ...body.data });
      await enqueueBackup(run.id);
      return NextResponse.json(run);
    } catch (error) {
      if ((error as Error).name === "BackupError") return errorResponse(409, (error as Error).message);
      throw error;
    }
  }

  if (section && /^[0-9a-f-]{36}$/.test(section)) {
    const run = await db.backupRun.findUnique({ where: { id: section } });
    if (!run) return errorResponse(404, "Backup not found");

    if (action === "pin" && request.method === "POST") {
      const { pinned } = z.object({ pinned: z.boolean() }).parse(await request.json());
      await db.backupRun.update({ where: { id: section }, data: { pinned } });
      if (!pinned) await applyRetention();
      return NextResponse.json({ id: section, pinned });
    }
    if (!action && request.method === "DELETE") {
      if (run.status === "running") return errorResponse(409, "Wait for the backup to finish");
      await removeBackup(section, ctx.userId, "deleted");
      return NextResponse.json({ id: section, deleted: true });
    }
    if (action === "download" && request.method === "GET") {
      if (run.status !== "done" || run.deletedAt) return errorResponse(404, "That backup isn't available");
      await audit(db, { blockId: "core", actorId: ctx.userId, entityType: "Backup", entityId: section, action: "downloaded", diff: { folder: run.folder } });
      return new NextResponse(tarStream(run.folder), {
        headers: {
          "content-type": "application/x-tar",
          "content-disposition": `attachment; filename="grid-backup-${run.folder}.tar"`,
          "cache-control": "no-store",
        },
      });
    }
  }
  return errorResponse(404, "Not found");
}

type P = { params: Promise<{ path?: string[] }> };
export const GET = async (request: NextRequest, { params }: P) => handle(request, (await params).path ?? []);
export const POST = async (request: NextRequest, { params }: P) => handle(request, (await params).path ?? []);
export const PUT = async (request: NextRequest, { params }: P) => handle(request, (await params).path ?? []);
export const DELETE = async (request: NextRequest, { params }: P) => handle(request, (await params).path ?? []);
