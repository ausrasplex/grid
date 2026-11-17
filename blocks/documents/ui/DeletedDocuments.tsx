"use client";

// Settings › Storage › Recently deleted documents: kept for the set number
// of days so a mis-tap can be undone. Restore them, or delete them now.

import { useState } from "react";
import { Alert, Button, Icon, List, Section, SelectRow, api, formatBytes, useAction, whenRemoved } from "@grid/ui";

export interface DeletedDocumentJson {
  id: string;
  title: string;
  where: string;
  versions: number;
  bytes: number;
  deletedBy: string;
  deletedAt: string;
}

const day = (date: string) => new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

export function DeletedDocuments({ initial, days }: { initial: DeletedDocumentJson[]; days: number }) {
  const [rows, setRows] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const action = useAction();
  if (!rows.length && !done) return null;

  const reload = async () => {
    setRows(await api<DeletedDocumentJson[]>("/documents/deleted"));
    setSelected(new Set());
  };
  const chosen = rows.filter((row) => selected.has(row.id));
  const purgeAt = (deletedAt: string) => new Date(new Date(deletedAt).getTime() + days * 86_400_000).toISOString();

  return (
    <Section title="Recently deleted documents" description={`Documents people deleted stay here for ${days} days, then they're removed for good.`} flush>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2 sm:px-5">
        <span className="flex-1 text-sm text-muted-foreground">{chosen.length ? `${chosen.length} chosen` : "Tick the ones to restore or delete"}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={!chosen.length || action.busy}
          onClick={() =>
            void action.run(async () => {
              for (const row of chosen) await api(`/documents/doc/${row.id}/restore`, { method: "POST" });
              setDone(`Restored ${chosen.length}. ${chosen.length === 1 ? "It's" : "They're"} back where ${chosen.length === 1 ? "it was" : "they were"}.`);
              await reload();
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
            void action.run(async () => {
              if (!window.confirm(`Delete ${chosen.length} for good? This can't be undone.`)) return;
              const result = await api<{ removed: number; bytes: number }>("/documents/deleted/delete-now", { body: { ids: chosen.map((row) => row.id) } });
              setDone(`Deleted ${result.removed} for good${result.bytes ? `, freeing ${formatBytes(result.bytes)}` : ""}.`);
              await reload();
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
            onChange={(on) => setSelected((current) => (on ? new Set(current).add(row.id) : new Set([...current].filter((id) => id !== row.id))))}
            media={
              <span className="flex size-full items-center justify-center text-muted-foreground">
                <Icon name="file" />
              </span>
            }
            title={row.title}
            meta={
              <>
                {row.where} · deleted by {row.deletedBy} on {day(row.deletedAt)}
                {row.bytes ? ` · ${formatBytes(row.bytes)}` : ""}
                <br />
                <span className="font-semibold text-foreground">Removed for good {whenRemoved(purgeAt(row.deletedAt))}</span>
              </>
            }
          />
        ))}
      </List>
    </Section>
  );
}
