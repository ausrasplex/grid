// File storage on disk (FILES_ROOT, an Unraid share in production).
// Images get two smaller copies on upload: "thumb" for grids and
// "display" for viewing on a phone, so the original only moves when
// someone asks for it.

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Tx } from "./client";
import type { Prisma } from "./generated/client";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Plan sets and other PDFs can be much bigger than photos. */
export const MAX_PDF_BYTES = 150 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export type FileVariant = "thumb" | "display" | "original";
interface VariantInfo {
  key: string;
  width: number;
  height: number;
  size: number;
}

export function filesRoot(): string {
  // FILES_ROOT is outside the app (an Unraid share), so the build shouldn't trace it.
  return path.resolve(/*turbopackIgnore: true*/ process.env.FILES_ROOT || "./data/files");
}

/**
 * Things Grid can make again from stored files (plan tiles…), kept under
 * <files>/.cache. Backups and the stray-file sweep skip it.
 */
export const CACHE_DIR = ".cache";
export function cacheRoot(...parts: string[]): string {
  const root = path.join(filesRoot(), CACHE_DIR);
  const full = path.resolve(root, ...parts);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Bad cache path");
  return full;
}

/** The file on disk, for tools that need a path (pdfinfo, pdftoppm). */
export function storedFilePath(file: { key: string }): string {
  return resolveKey(file.key);
}

/** Keys are made by us, but never let one escape the files folder. */
function resolveKey(key: string): string {
  const root = filesRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Bad file key");
  return full;
}

async function put(key: string, data: Buffer) {
  const full = resolveKey(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true });
  const temporary = `${full}.${randomUUID()}.tmp`;
  await writeFile(/*turbopackIgnore: true*/ temporary, data);
  await rename(/*turbopackIgnore: true*/ temporary, full); // never leave a half-written file behind
}

export class UploadError extends Error {
  // Set by hand: class names don't survive the production build, and Blocks
  // check err.name (they may load their own copy of this module).
  override name = "UploadError";
}

/**
 * Stores an uploaded image (JPEG, PNG or WebP) and its smaller copies.
 * The phone already turns HEIC into JPEG and shrinks big photos before
 * upload, so this mostly sees ~1–3 MB JPEGs.
 */
export async function saveImageUpload(
  tx: Tx,
  input: { companyId: string; userId: string; data: Buffer; name?: string | null },
) {
  if (input.data.length > MAX_UPLOAD_BYTES) throw new UploadError("That file is too big (25 MB at most)");
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input.data).metadata();
  } catch {
    throw new UploadError("That doesn't look like a photo");
  }
  const mime = meta.format ? IMAGE_TYPES[meta.format] : undefined;
  if (!mime) throw new UploadError("Photos need to be JPEG, PNG or WebP");

  const id = randomUUID();
  const now = new Date();
  const directory = `${input.companyId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const extension = meta.format === "jpeg" ? "jpg" : meta.format!;
  const key = `${directory}/${id}.${extension}`;
  await put(key, input.data);

  // .rotate() applies the camera's orientation, so copies are upright.
  const variants: Record<string, VariantInfo> = {};
  for (const [name, edge, quality] of [["thumb", 480, 70], ["display", 2048, 82]] as const) {
    const { data, info } = await sharp(input.data)
      .rotate()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    const variantKey = `${directory}/${id}.${name}.jpg`;
    await put(variantKey, data);
    variants[name] = { key: variantKey, width: info.width, height: info.height, size: info.size };
  }
  // EXIF orientations 5–8 are sideways: swap so width/height are as seen.
  const sideways = (meta.orientation ?? 1) >= 5;

  return tx.storedFile.create({
    data: {
      id,
      companyId: input.companyId,
      key,
      mime,
      size: input.data.length,
      width: (sideways ? meta.height : meta.width) ?? null,
      height: (sideways ? meta.width : meta.height) ?? null,
      sha256: createHash("sha256").update(input.data).digest("hex"),
      variants: variants as unknown as Prisma.InputJsonValue,
      originalName: input.name?.slice(0, 200) ?? null,
      createdById: input.userId,
    },
    select: { id: true, width: true, height: true, size: true },
  });
}

/** True for a PDF (by its first bytes, not its name). */
export function isPdf(data: Buffer) {
  return data.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Stores an uploaded PDF as it is (plans, documents). */
export async function saveDocumentUpload(tx: Tx, input: { companyId: string; userId: string; data: Buffer; name?: string | null }) {
  if (input.data.length > MAX_PDF_BYTES) throw new UploadError("That file is too big (150 MB at most)");
  if (!isPdf(input.data)) throw new UploadError("That doesn't look like a PDF");
  const id = randomUUID();
  const now = new Date();
  const key = `${input.companyId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.pdf`;
  await put(key, input.data);
  return tx.storedFile.create({
    data: {
      id,
      companyId: input.companyId,
      key,
      mime: "application/pdf",
      size: input.data.length,
      sha256: createHash("sha256").update(input.data).digest("hex"),
      variants: {},
      originalName: input.name?.slice(0, 200) ?? null,
      createdById: input.userId,
    },
    select: { id: true, width: true, height: true, size: true },
  });
}

/**
 * Hands an uploaded file to a block's record. Only the person who uploaded
 * it, in the same company, can attach it, and only once.
 */
export async function attachFile(tx: Tx, fileId: string, by: { companyId: string; userId: string; blockId: string }) {
  const result = await tx.storedFile.updateMany({
    where: { id: fileId, companyId: by.companyId, createdById: by.userId, blockId: null, deletedAt: null },
    data: { blockId: by.blockId, attachedAt: new Date() },
  });
  if (result.count !== 1) throw new UploadError("That upload can't be used here. Try taking the photo again.");
}

/** Opens a file (or one of its copies) for streaming. */
export async function openStoredFile(file: { key: string; mime: string; variants: unknown }, variant: FileVariant) {
  const variantInfo = variant === "original" ? null : (file.variants as Record<string, VariantInfo>)[variant];
  const key = variantInfo?.key ?? file.key;
  const full = resolveKey(key);
  const stats = await stat(/*turbopackIgnore: true*/ full);
  return { stream: createReadStream(/*turbopackIgnore: true*/ full), size: stats.size, mime: variantInfo ? "image/jpeg" : file.mime };
}

/** Original plus copies: what removing a file frees up. */
export function storedBytes(file: { size: number; variants: unknown }): number {
  const variants = Object.values((file.variants ?? {}) as Record<string, VariantInfo>);
  return file.size + variants.reduce((total, variant) => total + (variant.size ?? 0), 0);
}

/** Every key a file uses on disk (original and copies). */
export function storedKeys(file: { key: string; variants: unknown }): string[] {
  return [file.key, ...Object.values((file.variants ?? {}) as Record<string, VariantInfo>).map((value) => value.key)];
}

async function removeKey(key: string) {
  try {
    await unlink(/*turbopackIgnore: true*/ resolveKey(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; // already gone is fine
  }
}

/**
 * Removes a file's bytes from disk (original and copies) and marks the row
 * purged. The row stays so the history and audit log still make sense.
 * Returns the bytes freed.
 */
export async function purgeStoredFile(tx: Tx, fileId: string): Promise<number> {
  const file = await tx.storedFile.findUnique({ where: { id: fileId } });
  if (!file || file.purgedAt) return 0;
  for (const key of storedKeys(file)) await removeKey(key);
  const now = new Date();
  await tx.storedFile.update({ where: { id: fileId }, data: { purgedAt: now, deletedAt: file.deletedAt ?? now } });
  return storedBytes(file);
}

/**
 * Files on disk the database doesn't know about (a crash between writing
 * the file and saving its row, stray .tmp files), older than a day.
 */
export async function findStrayFiles(known: Set<string>, olderThan: Date): Promise<{ key: string; bytes: number }[]> {
  const root = filesRoot();
  const out: { key: string; bytes: number }[] = [];
  async function walk(directory: string) {
    let entries;
    try {
      entries = await readdir(/*turbopackIgnore: true*/ directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (directory === root && entry.name === CACHE_DIR) continue; // made again from stored files
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const key = path.relative(root, full).split(path.sep).join("/");
        if (known.has(key)) continue;
        const stats = await stat(/*turbopackIgnore: true*/ full);
        if (stats.mtime < olderThan) out.push({ key, bytes: stats.size });
      }
    }
  }
  await walk(root);
  return out;
}

export async function removeStrayFile(key: string) {
  await removeKey(key);
}

/**
 * Stores a file Grid made itself (a quote PDF, later a signed copy), already
 * attached to the block that owns it. No smaller copies.
 */
export async function saveGeneratedFile(
  tx: Tx,
  input: { companyId: string; userId: string | null; blockId: string; data: Buffer; mime: string; name: string; ext: string },
) {
  const id = randomUUID();
  const now = new Date();
  const key = `${input.companyId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.${input.ext}`;
  await put(key, input.data);
  return tx.storedFile.create({
    data: {
      id,
      companyId: input.companyId,
      blockId: input.blockId,
      attachedAt: now,
      key,
      mime: input.mime,
      size: input.data.length,
      sha256: createHash("sha256").update(input.data).digest("hex"),
      originalName: input.name,
      createdById: input.userId,
    },
    select: { id: true, sha256: true },
  });
}

/** Reads a whole stored file into memory (small files: PDFs to attach to an email). */
export async function readStoredFile(file: { key: string; mime: string; variants: unknown }): Promise<Buffer> {
  const { stream } = await openStoredFile(file, "original");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
