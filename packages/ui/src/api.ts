"use client";

import { useCallback, useEffect, useState } from "react";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Calls /api<path> and returns parsed JSON, throwing ApiError with the server's message. */
export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: options.body === undefined ? undefined : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "same-origin",
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error?.code ?? "error", data?.error?.message ?? `Request failed (${response.status})`);
  }
  return data as T;
}

/** Loads a GET endpoint with loading/error state and a reload() function. Pass null to skip. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);

  const reload = useCallback(async () => {
    if (path === null) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/** Wraps an action with busy + error state for buttons and forms. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <R,>(callback: () => Promise<R>): Promise<R | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await callback();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}
