// Business pictures and pictures in the Clients list
// (docs/quotations-block.md "Pictures").
//
//   GET    /api/pictures/company/<companyId>/<file>.jpg   a business picture: anyone in that business
//   GET    /api/pictures/clients/<companyId>/<file>.jpg   a client's photo or a client business's logo:
//                                                         that business's people who can see clients
//   POST   /api/pictures/company                          your business's picture (multipart "file")
//   DELETE /api/pictures/company                        back to one made from the Branding logo (if any)
//   POST   /api/pictures/client/<clientId>                a client's photo
//   POST   /api/pictures/business/<businessId>            a client business's logo
//   DELETE /api/pictures/client/<id>, /business/<id>
//
// Uploads return { pictureUrl }. Old pictures are deleted from disk straight away.
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { can, isHttpError } from "@grid/core";
import { MAX_UPLOAD_BYTES, db, openAvatar } from "@grid/db";
import { businessPicture, removeBusinessPicture, uploadBusinessPicture } from "@grid/block-companies";
import { canSeeClientPicture, setClientPicture, type PictureOwner } from "@grid/block-clients";
import { pictureFromLogo } from "@grid/block-templates";
import { getContext } from "@/lib/context";
import { getSessionUserId } from "@/lib/session";
import "@/blocks"; // sets up the app, so audit entries get the IP and device

type Params = { params: Promise<{ path: string[] }> };

const fail = (status: number, message: string) =>
  NextResponse.json(
    { error: { code: { 401: "unauthorized", 403: "forbidden", 404: "not_found", 413: "too_large" }[status] ?? "invalid_input", message } },
    { status },
  );
const isId = (value: string | undefined): value is string => !!value && /^[0-9a-f-]{36}$/.test(value);

export async function GET(_request: Request, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return fail(401, "Sign in required");
  const [folder, ownerId, file, ...rest] = (await params).path;
  if (rest.length || !isId(ownerId) || !file || !/^[0-9a-f-]{36}\.jpg$/.test(file)) return fail(404, "Not found");
  const key = `pictures/${folder}/${ownerId}/${file}`;

  let allowed = false;
  if (folder === "company") {
    // Its current picture, to people in that business.
    const [company, membership] = await Promise.all([
      db.company.findFirst({ where: { id: ownerId, logoKey: key, deletedAt: null }, select: { id: true } }),
      db.membership.findFirst({ where: { companyId: ownerId, userId, status: "ACTIVE" }, select: { id: true } }),
    ]);
    allowed = !!company && !!membership;
  } else if (folder === "clients") {
    const ctx = await getContext();
    allowed = !!ctx && ctx.companyId === ownerId && can(ctx, "clients.view") && (await canSeeClientPicture(ctx, key));
  }
  if (!allowed) return fail(404, "Not found");

  try {
    const { stream, size } = await openAvatar(key);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(size),
        // A new picture gets a new name, so this one never changes.
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return fail(404, "Not found");
  }
}

/** Who may change what: your business's picture, or a client's or client business's. */
async function changeTarget(path: string[]) {
  const ctx = await getContext();
  if (!ctx) return { error: fail(401, "Sign in required") } as const;
  if (!ctx.companyId) return { error: fail(400, "Pick a business first") } as const;
  const [kind, id, ...rest] = path;
  if (kind === "company" && !id) {
    if (!can(ctx, "companies.details.edit")) return { error: fail(403, "You can't change the business's details") } as const;
    return { ctx, kind: "company" } as const;
  }
  if ((kind === "client" || kind === "business") && isId(id) && !rest.length) {
    if (!can(ctx, "clients.edit")) return { error: fail(403, "You can't change clients") } as const;
    return { ctx, kind: kind as PictureOwner, id } as const;
  }
  return { error: fail(404, "Not found") } as const;
}

async function run(callback: () => Promise<unknown>) {
  try {
    return NextResponse.json(await callback());
  } catch (error) {
    if ((error as Error).name === "UploadError") return fail(400, (error as Error).message);
    if (isHttpError(error)) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    console.error("[pictures] failed", error);
    return NextResponse.json({ error: { code: "server_error", message: "Couldn't save the picture" } }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const target = await changeTarget((await params).path);
  if ("error" in target) return target.error;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) return fail(413, "That picture is too big (25 MB at most)");
  let file: File | null = null;
  try {
    const upload = (await request.formData()).get("file");
    file = upload instanceof File ? upload : null;
  } catch {
    /* handled below */
  }
  if (!file) return fail(400, "No picture was sent");
  const data = Buffer.from(await file.arrayBuffer());
  return run(() => (target.kind === "company" ? uploadBusinessPicture(target.ctx, data) : setClientPicture(target.ctx, target.kind, target.id, data)));
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const target = await changeTarget((await params).path);
  if ("error" in target) return target.error;
  return run(async () => {
    if (target.kind !== "company") return setClientPicture(target.ctx, target.kind, target.id, null);
    await removeBusinessPicture(target.ctx);
    await pictureFromLogo(target.ctx.companyId!, target.ctx.userId);
    return businessPicture(target.ctx.companyId!);
  });
}
