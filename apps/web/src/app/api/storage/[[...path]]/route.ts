// Settings › Storage (core).
//   GET  /api/storage/unfiled            this company's uploads never filed against a job
//   POST /api/storage/unfiled/delete     { ids } delete them now
//   GET  /api/storage/history            clean-up history (yours; everything for the server admin)
//   GET  /api/storage/settings           retention settings
//   PUT  /api/storage/settings           change them (server admin)
//   POST /api/storage/run                run the clean-up now (server admin)
//   GET  /api/storage/usage              space used per business (server admin)

import { statfs } from "node:fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  db,
  filesRoot,
  getStorageSettings,
  purgeDate,
  purgeStoredFile,
  recordCleanup,
  setStorageSettings,
  storedBytes,
  type CleanupItemInput,
} from "@grid/db";
import { getContext, type AppContext } from "@/lib/context";
import { runCleanup } from "@/lib/cleanup";

const error = (status: number, message: string) => NextResponse.json({ error: { code: status === 403 ? "forbidden" : "invalid_input", message } }, { status });
const day = (date: Date) => date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

const settingsSchema = z
  .object({
    unfiledDays: z.number().int().min(1).max(365),
    deletedDays: z.number().int().min(1).max(365),
    mode: z.enum(["on", "dry-run", "off"]),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time, e.g. 02:30"),
  })
  .strict();

const isManager = (ctx: AppContext) => !!ctx.companyId && ctx.permissions.has("companies.storage.manage");

async function handle(request: NextRequest, path: string[]) {
  const ctx = await getContext();
  if (!ctx) return error(401, "Sign in required");
  const route = `${request.method} ${path.join("/")}`;
  const admin = ctx.user.serverAdmin;

  switch (route) {
    case "GET unfiled": {
      if (!isManager(ctx)) return error(403, "Not allowed");
      const { unfiledDays } = await getStorageSettings();
      const files = await db.storedFile.findMany({
        where: { companyId: ctx.companyId!, blockId: null, deletedAt: null, purgedAt: null },
        orderBy: { createdAt: "asc" },
        take: 1000,
      });
      const users = await db.user.findMany({ where: { id: { in: files.map((file) => file.createdById ?? "") } }, select: { id: true, name: true } });
      const name = new Map(users.map((user) => [user.id, user.name]));
      return NextResponse.json(
        files.map((file) => ({
          id: file.id,
          name: file.originalName,
          uploadedBy: name.get(file.createdById ?? "") ?? "Someone",
          uploadedAt: file.createdAt,
          removeAt: purgeDate(file.createdAt, unfiledDays),
          bytes: storedBytes(file),
        })),
      );
    }

    case "POST unfiled/delete": {
      if (!isManager(ctx)) return error(403, "Not allowed");
      const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) }).parse(await request.json());
      const files = await db.storedFile.findMany({ where: { id: { in: ids }, companyId: ctx.companyId!, blockId: null, purgedAt: null } });
      const items: CleanupItemInput[] = [];
      for (const file of files) {
        const bytes = await db.$transaction((tx) => purgeStoredFile(tx, file.id));
        items.push({ companyId: file.companyId, kind: "unfiled", label: `Unfiled upload${file.originalName ? ` "${file.originalName}"` : ""}, uploaded ${day(file.createdAt)}`, refId: file.id, bytes });
      }
      if (items.length) await recordCleanup({ trigger: "delete-now", mode: "on", userId: ctx.userId, items });
      return NextResponse.json({ removed: items.length, bytes: items.reduce((total, item) => total + item.bytes, 0) });
    }

    case "GET history": {
      if (!isManager(ctx) && !admin) return error(403, "Not allowed");
      // The server admin sees every run; a business sees the runs that touched its things.
      const scope = admin && request.nextUrl.searchParams.get("scope") === "server" ? "server" : "company";
      const itemWhere = scope === "server" ? {} : { companyId: ctx.companyId! };
      const runs = await db.cleanupRun.findMany({
        where: scope === "server" ? {} : { items: { some: itemWhere } },
        orderBy: { startedAt: "desc" },
        take: 50,
        include: { items: { where: itemWhere, orderBy: { createdAt: "asc" }, take: 300 } },
      });
      const users = await db.user.findMany({ where: { id: { in: runs.map((run) => run.triggeredById ?? "") } }, select: { id: true, name: true } });
      const name = new Map(users.map((user) => [user.id, user.name]));
      return NextResponse.json(
        runs.map((run) => ({
          id: run.id,
          trigger: run.trigger,
          mode: run.mode,
          by: run.triggeredById ? (name.get(run.triggeredById) ?? "Someone") : null,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          error: run.error,
          summary: run.summary,
          items: run.items.map((item) => ({ id: item.id, kind: item.kind, label: item.label, bytes: item.bytes, applied: item.applied })),
        })),
      );
    }

    case "GET settings":
      if (!isManager(ctx) && !admin) return error(403, "Not allowed");
      return NextResponse.json(await getStorageSettings());

    case "PUT settings": {
      if (!admin) return error(403, "Only the server admin can change this");
      const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return error(400, parsed.error.issues[0]?.message ?? "Check the settings");
      await setStorageSettings(parsed.data, ctx.userId);
      return NextResponse.json(parsed.data);
    }

    case "POST run": {
      if (!admin) return error(403, "Only the server admin can run the clean-up");
      return NextResponse.json(await runCleanup({ trigger: "manual", userId: ctx.userId }));
    }

    case "GET usage": {
      if (!admin) return error(403, "Not allowed");
      const rows = await db.$queryRaw<{ companyId: string; files: bigint; bytes: bigint }[]>`
        SELECT "companyId", COUNT(*) AS files,
               SUM(size + COALESCE((variants->'thumb'->>'size')::int, 0) + COALESCE((variants->'display'->>'size')::int, 0)) AS bytes
        FROM "StoredFile" WHERE "purgedAt" IS NULL GROUP BY "companyId"`;
      const companies = await db.company.findMany({ where: { id: { in: rows.map((row) => row.companyId) } }, select: { id: true, name: true } });
      const cname = new Map(companies.map((company) => [company.id, company.name]));
      let disk: { free: number; total: number } | null = null;
      try {
        const diskStats = await statfs(/*turbopackIgnore: true*/ filesRoot());
        disk = { free: diskStats.bavail * diskStats.bsize, total: diskStats.blocks * diskStats.bsize };
      } catch {
        /* folder not created yet */
      }
      return NextResponse.json({
        businesses: rows
          .map((row) => ({ id: row.companyId, name: cname.get(row.companyId) ?? "Removed business", files: Number(row.files), bytes: Number(row.bytes ?? 0) }))
          .sort((first, second) => second.bytes - first.bytes),
        disk,
      });
    }
  }
  return error(404, "Not found");
}

type P = { params: Promise<{ path?: string[] }> };
export async function GET(request: NextRequest, { params }: P) {
  return handle(request, (await params).path ?? []);
}
export async function POST(request: NextRequest, { params }: P) {
  return handle(request, (await params).path ?? []);
}
export async function PUT(request: NextRequest, { params }: P) {
  return handle(request, (await params).path ?? []);
}
