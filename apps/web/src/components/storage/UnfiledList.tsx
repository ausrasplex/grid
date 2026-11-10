"use client";

// Uploads that reached the server but were never filed against a job
// (signal dropped between the two steps, then the photo was removed from
// the phone). Removed automatically after the set number of days.

import { useState } from "react";
import { Alert, Button, EmptyState, List, Section, SelectRow, api, formatBytes, useAction, useApi, whenRemoved } from "@grid/ui";

interface Row {
  id: string;
  name: string | null;
  uploadedBy: string;
  uploadedAt: string;
  removeAt: string;
  bytes: number;
}

const when = (value: string) => new Date(value).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function UnfiledList({ days }: { days: number }) {
  const { data, reload } = useApi<Row[]>("/storage/unfiled");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const action = useAction();
  const rows = data ?? [];

  return (
    <Section
      title="Unfiled uploads"
      description={`Photos that reached the server but were never added to a job. They're removed automatically after ${days} days.`}
      flush
    >
      {data && rows.length === 0 ? (
        <EmptyState title="No unfiled uploads" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-4 pb-2 sm:px-5">
            <label className="flex min-h-touch items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-5 accent-[var(--color-primary)]"
                checked={rows.length > 0 && selected.size === rows.length}
                onChange={(event) => setSelected(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())}
              />
              Select all ({rows.length})
            </label>
            <span className="flex-1" />
            <Button
              variant="destructive"
              size="sm"
              disabled={!selected.size || action.busy}
              onClick={() =>
                action.run(async () => {
                  if (!window.confirm(`Delete ${selected.size} unfiled upload${selected.size === 1 ? "" : "s"} for good?`)) return false;
                  const result = await api<{ removed: number; bytes: number }>("/storage/unfiled/delete", { body: { ids: [...selected] } });
                  setDone(`Deleted ${result.removed}, freeing ${formatBytes(result.bytes)}.`);
                  setSelected(new Set());
                  reload();
                  return true;
                })
              }
            >
              Delete now
            </Button>
          </div>
          <div className="px-4 sm:px-5">
            <Alert variant="error">{action.error}</Alert>
            {done && <Alert variant="success">{done}</Alert>}
          </div>
          <List>
            {rows.map((row) => (
              <SelectRow
                key={row.id}
                checked={selected.has(row.id)}
                onChange={(on) => setSelected((currentSelected) => (on ? new Set(currentSelected).add(row.id) : new Set([...currentSelected].filter((selectedId) => selectedId !== row.id))))}
                // eslint-disable-next-line @next/next/no-img-element
                media={<img src={`/api/files/${row.id}?v=thumb`} alt="" className="size-full object-cover" />}
                title={row.name ?? "Photo"}
                meta={
                  <>
                    Uploaded by {row.uploadedBy}, {when(row.uploadedAt)} · {formatBytes(row.bytes)}
                    <br />
                    <span className="font-semibold text-foreground">Removed {whenRemoved(row.removeAt)}</span>
                  </>
                }
              />
            ))}
          </List>
        </>
      )}
    </Section>
  );
}
