// Upload: POST /api/files with multipart field "file". Returns { id }.
// Photos (JPEG, PNG, WebP, 25 MB) or PDFs (plans, documents, 150 MB).
// The file then belongs to nobody until a block attaches it (e.g. photos).
import { NextResponse, type NextRequest } from "next/server";
import { MAX_PDF_BYTES, db, isPdf, saveDocumentUpload, saveImageUpload } from "@grid/db";
import { getContext } from "@/lib/context";

export async function POST(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
  if (!ctx.companyId) return NextResponse.json({ error: { code: "invalid_input", message: "Select a company first" } }, { status: 400 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_PDF_BYTES + 64 * 1024) {
    return NextResponse.json({ error: { code: "too_large", message: "That file is too big (150 MB at most)" } }, { status: 413 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const upload = form.get("file");
    file = upload instanceof File ? upload : null;
  } catch {
    /* handled below */
  }
  if (!file) return NextResponse.json({ error: { code: "invalid_input", message: "No file was sent" } }, { status: 400 });

  try {
    const data = Buffer.from(await file.arrayBuffer());
    const input = { companyId: ctx.companyId, userId: ctx.userId, data, name: file.name };
    const saved = isPdf(data) ? await saveDocumentUpload(db, input) : await saveImageUpload(db, input);
    return NextResponse.json(saved);
  } catch (error) {
    if ((error as Error).name === "UploadError") return NextResponse.json({ error: { code: "bad_file", message: (error as Error).message } }, { status: 400 });
    console.error("[files] upload failed", error);
    return NextResponse.json({ error: { code: "server_error", message: "Couldn't save the file" } }, { status: 500 });
  }
}
