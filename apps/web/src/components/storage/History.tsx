"use client";

// Clean-up history: every nightly run, "Run clean-up now" and "Delete now",
// with what each removed. A business sees what touched its own things; the
// server admin can switch to everything on the server.

import { useState } from "react";
import { Badge, EmptyState, Icon, Loading, Section, Segmented, cn, formatBytes, useApi } from "@grid/ui";

interface Run {
  id: string;
  trigger: "schedule" | "manual" | "delete-now";
  mode: "on" | "dry-run";
  by: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  summary: { count?: number; bytes?: number };
  items: { id: string; kind: string; label: string; bytes: number; applied: boolean }[];
}

const when = (value: string) => new Date(value).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const TRIGGER = { schedule: "Nightly clean-up", manual: "Clean-up run by hand", "delete-now": "Deleted now" };
const KIND: Record<string, string> = { unfiled: "Unfiled upload", "deleted-photo": "Deleted photo", "deleted-note": "Deleted note", "deleted-plan": "Deleted plan sheet", stray: "Stray file" };

export function History({ serverAdmin }: { serverAdmin: boolean }) {
  const [scope, setScope] = useState<"company" | "server">("company");
  const { data, loading } = useApi<Run[]>(`/storage/history?scope=${scope}`);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Section
      title="Clean-up history"
      description="What was removed, when, and by whom. Dry runs show what would have gone."
      flush
    >
      {serverAdmin && (
        // In the body, not the header, so the title keeps its width on phones.
        <div className="px-4 pb-3 sm:px-5">
          <Segmented
            label="Whose history"
            value={scope}
            onChange={setScope}
            items={[
              { value: "company", label: "This business" },
              { value: "server", label: "Whole server" },
            ]}
          />
        </div>
      )}
      {loading && !data ? (
        <div className="px-4 pb-4 sm:px-5">
          <Loading rows={3} />
        </div>
      ) : !data?.length ? (
        <EmptyState title="Nothing removed yet" />
      ) : (
        <ul className="divide-y">
          {data.map((entry) => {
            const count = entry.items.length;
            const bytes = entry.items.reduce((total, item) => total + item.bytes, 0);
            const isOpen = open === entry.id;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : entry.id)}
                  className="flex min-h-touch-lg w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted sm:px-5"
                >
                  <Icon name={entry.trigger === "delete-now" ? "close" : "archive"} className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      {TRIGGER[entry.trigger]}
                      {entry.mode === "dry-run" && <Badge>Dry run</Badge>}
                      {entry.error && <Badge variant="destructive">Stopped early</Badge>}
                      {!entry.finishedAt && <Badge>Running</Badge>}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {when(entry.startedAt)}
                      {entry.by ? ` · ${entry.by}` : ""} · {count === 0 ? "nothing to remove" : `${count} item${count === 1 ? "" : "s"}, ${formatBytes(bytes)}`}
                    </span>
                  </span>
                  {count > 0 && <Icon name="chevron-down" className={cn("size-5 transition-transform", isOpen && "rotate-180")} />}
                </button>
                {isOpen && count > 0 && (
                  <ul className="flex flex-col gap-1 bg-muted/40 px-4 py-3 text-sm sm:px-5">
                    {entry.error && <li className="text-destructive">{entry.error}</li>}
                    {entry.items.map((item) => (
                      <li key={item.id} className="flex gap-2">
                        <span className="w-28 shrink-0 text-muted-foreground">{KIND[item.kind] ?? item.kind}</span>
                        <span className="min-w-0 flex-1">
                          {item.label}
                          {item.bytes ? <span className="text-muted-foreground"> · {formatBytes(item.bytes)}</span> : null}
                          {!item.applied && <span className="text-muted-foreground"> · would be removed</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
