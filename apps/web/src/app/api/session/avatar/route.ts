// Your profile picture (Settings › Profile).
//   POST   multipart field "file": crops it square and makes it your picture
//   DELETE back to your initials
// Returns { avatarUrl }. The old picture is deleted from disk straight away.
import { NextResponse, type NextRequest } from "next/server";
import { MAX_UPLOAD_BYTES, audit, avatarUrl, db, removeAvatar, saveAvatar } from "@grid/db";
import { getSessionUserId } from "@/lib/session";
import "@/blocks"; // sets up the app, so the audit entry gets the IP and device

const fail = (status: number, message: string) =>
  NextResponse.json({ error: { code: status === 401 ? "unauthorized" : status === 413 ? "too_large" : "invalid_input", message } }, { status });

/** Swaps the picture (or clears it) and records it. */
async function setPicture(userId: string, avatarKey: string | null) {
  const { previous, user } = await db.$transaction(async (tx) => {
    const before = await tx.user.findFirstOrThrow({ where: { id: userId, deletedAt: null }, select: { avatarKey: true } });
    const after = await tx.user.update({ where: { id: userId }, data: { avatarKey }, select: { id: true, avatarKey: true, image: true } });
    await audit(tx, { blockId: "users", actorId: userId, entityType: "User", entityId: userId, action: avatarKey ? "picture_changed" : "picture_removed" });
    return { previous: before.avatarKey, user: after };
  });
  if (previous && previous !== avatarKey) await removeAvatar(previous).catch((error) => console.error("[avatar] couldn't delete the old picture", error));
  return NextResponse.json({ avatarUrl: avatarUrl(user) });
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return fail(401, "Sign in required");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) return fail(413, "That photo is too big (25 MB at most)");

  let file: File | null = null;
  try {
    const upload = (await request.formData()).get("file");
    file = upload instanceof File ? upload : null;
  } catch {
    /* handled below */
  }
  if (!file) return fail(400, "No photo was sent");

  let key: string;
  try {
    key = await saveAvatar(userId, Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    if ((error as Error).name === "UploadError") return fail(400, (error as Error).message);
    console.error("[avatar] upload failed", error);
    return NextResponse.json({ error: { code: "server_error", message: "Couldn't save the photo" } }, { status: 500 });
  }
  try {
    return await setPicture(userId, key);
  } catch (error) {
    await removeAvatar(key).catch(() => {});
    throw error;
  }
}

export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) return fail(401, "Sign in required");
  return setPicture(userId, null);
}
