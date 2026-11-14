// A person's profile picture: GET /api/avatars/<userId>/<file>.jpg
// Anyone signed in can see it (it's shown beside their name in teams and
// on jobs). Only their current picture is served, never an old one.
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { db, openAvatar } from "@grid/db";
import { getSessionUserId } from "@/lib/session";

const notFound = () => NextResponse.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string; file: string }> }) {
  if (!(await getSessionUserId())) return NextResponse.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
  const { userId, file } = await params;
  if (!/^[0-9a-f-]{36}$/.test(userId) || !/^[0-9a-f-]{36}\.jpg$/.test(file)) return notFound();
  const key = `avatars/${userId}/${file}`;
  const user = await db.user.findFirst({ where: { id: userId, avatarKey: key, deletedAt: null }, select: { id: true } });
  if (!user) return notFound();
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
    return notFound();
  }
}
