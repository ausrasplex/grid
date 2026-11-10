// AES-256-GCM encryption for secrets stored in the database
// (SMTP passwords, OAuth refresh tokens). The key comes from
// APP_ENCRYPTION_KEY and must be backed up separately from the database.
// Stored format: "v1:<iv>:<tag>:<ciphertext>" (base64 parts). The version
// prefix allows key rotation later.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not set (generate: openssl rand -base64 32)");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export function encryptSecret(plain: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, nonce, tag, data] = stored.split(":");
  if (version !== "v1" || !nonce || !tag || !data) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(nonce, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
