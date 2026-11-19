"use client";

// Sign-offs made with no signal wait on the phone (localStorage) and are
// sent when it's back, like photos. Each carries an id made here, so one
// sent twice is kept once. Small: a sign-off is a few dozen bytes.

export interface PendingSignoff {
  documentId: string;
  id: string;
  sheetName: string;
  rowKey: string;
  signedOff: boolean;
  note: string | null;
  rowText: string;
  at: string;
}

const KEY = "grid-signoffs-outbox";

function readAll(): PendingSignoff[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? (value as PendingSignoff[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: PendingSignoff[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Private window or full: they stay in memory for this visit (the caller keeps them in state).
  }
}

export const pendingFor = (documentId: string) => readAll().filter((item) => item.documentId === documentId);

export function addPending(item: PendingSignoff) {
  writeAll([...readAll(), item]);
}

export function removePending(ids: string[]) {
  const gone = new Set(ids);
  writeAll(readAll().filter((item) => !gone.has(item.id)));
}

