"use client";

// Offline photo capture. Photos are saved on the phone first (IndexedDB),
// then uploaded when there's signal: in a basement or plant room nothing is
// lost, and it catches up by itself. Each photo carries an id made here, so
// sending it twice never makes two copies.

import { api } from "@grid/ui";

export interface OutboxItem {
  id: string;
  projectId: string;
  jobName: string;
  buildingId: string | null;
  levelId: string | null;
  tag: "NONE" | "BEFORE" | "AFTER";
  caption: string;
  takenAt: number;
  blob: Blob;
  name: string;
  /** Set once the file itself is on the server. */
  fileId?: string;
  state: "waiting" | "uploading" | "failed";
  error?: string;
}

const DATABASE_NAME = "grid-photos";
const STORE = "outbox";
const EVENT = "grid-outbox";

// Without IndexedDB (some private windows) photos are held in memory instead.
const memory = new Map<string, OutboxItem>();

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = callback(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const stored = (await withStore<OutboxItem[]>("readonly", (store) => store.getAll())) ?? [];
  return [...stored, ...memory.values()].sort((first, second) => first.takenAt - second.takenAt);
}

async function save(item: OutboxItem) {
  const db = await openDb();
  if (!db) return void memory.set(item.id, item);
  await withStore("readwrite", (store) => store.put(item));
}

async function remove(id: string) {
  memory.delete(id);
  await withStore("readwrite", (store) => store.delete(id));
}

function notify() {
  window.dispatchEvent(new Event(EVENT));
}

export async function addToOutbox(items: OutboxItem[]) {
  for (const item of items) await save(item);
  notify();
  void processOutbox();
}

export async function discard(id: string) {
  await remove(id);
  notify();
}

export async function retryFailed() {
  for (const item of await listOutbox()) if (item.state === "failed") await save({ ...item, state: "waiting", error: undefined });
  notify();
  void processOutbox();
}

let running: Promise<void> | null = null;

/** Uploads everything waiting, one at a time. Safe to call as often as you like. */
export function processOutbox(): Promise<void> {
  if (!running) running = run().finally(() => (running = null));
  return running;
}

async function run() {
  for (const item of await listOutbox()) {
    if (item.state === "failed") continue;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    let current: OutboxItem = { ...item, state: "uploading" };
    await save(current);
    notify();
    // Two tries: if the server says the earlier upload has expired (410,
    // cleaned up after a long time offline), send the photo again.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!current.fileId) {
          const form = new FormData();
          form.append("file", current.blob, current.name);
          const response = await fetch("/api/files", { method: "POST", body: form, credentials: "same-origin" });
          const data = await response.json().catch(() => null);
          if (!response.ok) throw Object.assign(new Error(data?.error?.message ?? `Upload failed (${response.status})`), { status: response.status });
          current = { ...current, fileId: data.id as string };
          await save(current);
        }
        await api("/photos", {
          body: {
            id: current.id,
            projectId: current.projectId,
            fileId: current.fileId,
            buildingId: current.buildingId,
            levelId: current.levelId,
            tag: current.tag,
            caption: current.caption || undefined,
            takenAt: new Date(current.takenAt).toISOString(),
          },
        });
        await remove(current.id);
        notify();
        window.dispatchEvent(new CustomEvent("grid-photo-uploaded", { detail: { projectId: current.projectId } }));
        break;
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 410 && attempt === 0) {
          current = { ...current, fileId: undefined };
          await save(current);
          continue;
        }
        // No response at all, or the server's busy: try again later.
        if (status === undefined || status >= 500 || status === 401) {
          await save({ ...current, state: "waiting" });
          notify();
          return;
        }
        // The server said no (job finished, file not a photo…): keep it and say why.
        await save({ ...current, state: "failed", error: (error as Error).message });
        notify();
        break;
      }
    }
  }
}

export const OUTBOX_EVENT = EVENT;

/**
 * Shrinks a photo on the phone before it's stored or sent: long edge
 * 2560px, JPEG. Also turns iPhone HEIC photos into JPEG. Falls back to the
 * original file if the browser can't read it.
 */
export async function prepareImage(file: File): Promise<{ blob: Blob; name: string }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (blob) return { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
  } catch {
    /* fall through */
  }
  return { blob: file, name: file.name };
}

/** A v4 UUID. (crypto.randomUUID only exists on https, and Grid is often opened over plain http on the LAN.) */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
