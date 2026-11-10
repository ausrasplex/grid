// Download: GET /api/files/<id>?v=thumb|display|original
// The block that owns the file decides who may see it.
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { db, openStoredFile, type FileVariant } from "@grid/db";
import { registry } from "@/blocks";
import { getContext } from "@/lib/context";

const VARIANTS: FileVariant[] = ["thumb", "display", "original"];
const notFound = () => NextResponse.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return notFound();

  const file = await db.storedFile.findFirst({ where: { id, purgedAt: null } });
  if (!file) return notFound();

  // Managers see unfiled and deleted files of their own company (Settings › Storage).
  const manager = file.companyId === ctx.companyId && ctx.permissions.has("companies.storage.manage");
  let allowed = false;
  if (file.deletedAt) {
    allowed = manager;
  } else if (!file.blockId) {
    allowed = file.createdById === ctx.userId || manager; // not attached yet
  } else {
    const block = registry.get(file.blockId);
    const check = block?.fileAccess ? await block.fileAccess() : null;
    allowed = !!check && (block!.required || ctx.enabledBlocks.has(block!.id)) && (await check(ctx, id));
  }
  if (!allowed) return notFound(); // never reveal that the file exists

  const requested = (request.nextUrl.searchParams.get("v") ?? "display") as FileVariant;
  const variant = VARIANTS.includes(requested) ? requested : "display";
  try {
    const { stream, size, mime } = await openStoredFile(file, variant);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "content-type": mime,
        "content-length": String(size),
        // A file never changes once stored, so the phone can keep it.
        "cache-control": "private, max-age=31536000, immutable",
        ...(variant === "original" && request.nextUrl.searchParams.get("download") ? { "content-disposition": `attachment; filename="${(file.originalName ?? "photo.jpg").replace(/"/g, "")}"` } : {}),
      },
    });
  } catch {
    return notFound();
  }
}
