"use client";

// Settings › Storage › Recently deleted: photos and notes people deleted,
// kept for the set number of days so a mis-tap can be undone. Managers can
// restore them, or delete them now before their time is up.

import { useState } from "react";
import { Alert, Button, EmptyState, Icon, List, Section, SelectRow, api, formatBytes, useAction, whenRemoved } from "@grid/ui";

export interface DeletedRowJson {
  kind: "photo" | "note";
  id: string;
  fileId: string | null;
  text: string | null;
  job: string;
  projectId: string;
  addedBy: string;
  deletedBy: string;
  deletedAt: string;
  purgeAt: string;
  bytes: number;
}

const day = (date: string) => new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

export function DeletedList({ initial, days }: { initial: DeletedRowJson[]; days: number }) {
  const [rows, setRows] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const action = useAction();

  const reload = async () => {
    setRows(await api<DeletedRowJson[]>("/photos/deleted"));
    setSelected(new Set());
  };
  const chosen = rows.filter((row) => selected.has(row.id));
  const toggle = (id: string, on: boolean) => setSelected((currentSelected) => (on ? new Set(currentSelected).add(id) : new Set([...currentSelected].filter((selectedId) => selectedId !== id))));

  return (
    <Section
      title="Recently deleted"
      description={`Photos and notes people deleted. They stay here for ${days} days so a mistake can be undone, then they're removed for good.`}
      flush
    >
      {rows.length === 0 ? (
        <EmptyState title="Nothing deleted recently" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-4 pb-2 sm:px-5">
            <label className="flex min-h-touch items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-5 accent-[var(--color-primary)]"
                checked={selected.size === rows.length}
                onChange={(event) => setSelected(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())}
              />
              Select all ({rows.length})
            </label>
            <span className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              disabled={!chosen.length || action.busy}
              onClick={() =>
                action.run(async () => {
                  for (const item of chosen) await api("/photos/deleted/restore", { body: { kind: item.kind, id: item.id } });
                  setDone(`Restored ${chosen.length}. ${chosen.length === 1 ? "It's" : "They're"} back on the job.`);
                  await reload();
                  return true;
                })
              }
            >
              <Icon name="reopen" /> Restore
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!chosen.length || action.busy}
              onClick={() =>
                action.run(async () => {
                  if (!window.confirm(`Delete ${chosen.length} for good? This can't be undone.`)) return false;
                  const result = await api<{ removed: number; bytes: number }>("/photos/deleted/delete-now", {
                    body: { photoIds: chosen.filter((item) => item.kind === "photo").map((item) => item.id), noteIds: chosen.filter((item) => item.kind === "note").map((item) => item.id) },
                  });
                  setDone(`Deleted ${result.removed} for good${result.bytes ? `, freeing ${formatBytes(result.bytes)}` : ""}.`);
                  await reload();
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
                onChange={(on) => toggle(row.id, on)}
                media={
                  row.fileId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${row.fileId}?v=thumb`} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted-foreground">
                      <Icon name="note" />
                    </span>
                  )
                }
                title={row.kind === "photo" ? (row.text ? `Photo: ${row.text}` : "Photo") : `Note: ${row.text}`}
                meta={
                  <>
                    {row.job} · deleted by {row.deletedBy} on {day(row.deletedAt)}
                    {row.bytes ? ` · ${formatBytes(row.bytes)}` : ""}
                    <br />
                    <span className="font-semibold text-foreground">Removed for good {whenRemoved(row.purgeAt)}</span>
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
