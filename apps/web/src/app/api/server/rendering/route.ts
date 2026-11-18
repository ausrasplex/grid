// Settings › Plans & PDFs (server admin): how sharp plans, documents and
// quote PDFs are drawn for the in-app viewers.
//   GET   current levels, and which kinds this build has
//   PUT   save the levels (new uploads use them)
//   POST  { kinds: ["plans", "documents"] }: draw what's already there again
//         (queues each Block's "<kind>.rerender" job, when the Block is in
//         this build). Quote PDFs need nothing: they redraw when next opened.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PAGE_LEVELS, PLAN_LEVELS, audit, db, getRenderingSettings, setRenderingSettings } from "@grid/db";
import { getContext } from "@/lib/context";
import { hasJob, sendJob } from "@/lib/jobs";

const levelsSchema = z.object({ plans: z.enum(PLAN_LEVELS), documents: z.enum(PAGE_LEVELS), quotes: z.enum(PAGE_LEVELS) }).strict();
const rerenderSchema = z.object({ kinds: z.array(z.enum(["plans", "documents"])).min(1) }).strict();

async function admin() {
  const ctx = await getContext();
  return ctx?.user.serverAdmin ? ctx : null;
}
const denied = () => NextResponse.json({ error: { code: "forbidden", message: "Only the server admin can change this" } }, { status: 403 });
const invalid = (message: string) => NextResponse.json({ error: { code: "invalid_input", message } }, { status: 400 });

/** The kinds this build can draw again (their Block is in apps/web/src/blocks.ts). */
async function available() {
  return { plans: await hasJob("plans.rerender"), documents: await hasJob("documents.rerender") };
}

export async function GET() {
  if (!(await admin())) return denied();
  const { updatedAt: _updatedAt, ...levels } = await getRenderingSettings();
  return NextResponse.json({ ...levels, available: await available() });
}

export async function PUT(request: NextRequest) {
  const ctx = await admin();
  if (!ctx) return denied();
  const parsed = levelsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Check the settings");
  const { updatedAt: _updatedAt, ...before } = await getRenderingSettings();
  await db.$transaction(async (tx) => {
    await setRenderingSettings(parsed.data, ctx.userId, tx);
    await audit(tx, { blockId: "core", actorId: ctx.userId, entityType: "ServerSetting", entityId: "rendering", action: "updated", diff: { before, after: parsed.data } });
  });
  return NextResponse.json({ ...parsed.data, available: await available() });
}

export async function POST(request: NextRequest) {
  const ctx = await admin();
  if (!ctx) return denied();
  const parsed = rerenderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid("Pick what to draw again");
  const can = await available();
  const queued: string[] = [];
  for (const kind of parsed.data.kinds) {
    if (!can[kind]) continue;
    await sendJob(`${kind}.rerender`, {});
    queued.push(kind);
  }
  await db.$transaction((tx) => audit(tx, { blockId: "core", actorId: ctx.userId, entityType: "ServerSetting", entityId: "rendering", action: "rerender_started", diff: { kinds: queued } }));
  return NextResponse.json({ queued });
}
