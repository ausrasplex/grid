"use client";

// Settings › Clients › Lead sources (docs/quotations-block.md "Lead source"):
// the business's list of how clients find it. Add, rename, hide or show.
// Hiding keeps it on the clients and jobs that already have it.
import { useState } from "react";
import { Alert, Button, Field, PageHeader, Section, Stack, api, cn, useAction } from "@grid/ui";
import type { LeadSourceJson } from "./LeadSourceField";

export function LeadSources({ initial, canManage }: { initial: LeadSourceJson[]; canManage: boolean }) {
  const [sources, setSources] = useState(initial);
  const [adding, setAdding] = useState("");
  const action = useAction();
  const replace = (row: LeadSourceJson) => setSources((list) => list.map((source) => (source.id === row.id ? row : source)));
  const shown = sources.filter((source) => !source.hidden);
  const hidden = sources.filter((source) => source.hidden);

  return (
    <>
      <PageHeader
        title="Lead sources"
        meta={`${shown.length} on the list${hidden.length ? ` · ${hidden.length} hidden` : ""}`}
        subtitle="How clients find you. Tap one when you add a client; Analytics counts them up later. It's always optional."
      />
      <Stack>
        <Section flush>
          <ul className="divide-y">
            {shown.map((source) => (
              <SourceRow key={source.id} source={source} canManage={canManage} onSaved={replace} />
            ))}
          </ul>
        </Section>
        {canManage && (
          <Section title="Add one">
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void action.run(async () => {
                  const row = await api<LeadSourceJson>("/clients/lead-sources", { body: { name: adding } });
                  setSources((list) => [...list, row]);
                  setAdding("");
                });
              }}
            >
              <div className="flex-1">
                <Field label="Name" placeholder="e.g. Hipages, Local paper, Trade show" value={adding} onChange={(event) => setAdding(event.target.value)} />
              </div>
              <Button type="submit" disabled={!adding.trim() || action.busy}>
                Add
              </Button>
            </form>
            <Alert variant="error">{action.error}</Alert>
          </Section>
        )}
        {hidden.length > 0 && (
          <Section title="Hidden" description="Not offered for new clients. Clients and jobs that already have one keep it." flush>
            <ul className="divide-y">
              {hidden.map((source) => (
                <SourceRow key={source.id} source={source} canManage={canManage} onSaved={replace} />
              ))}
            </ul>
          </Section>
        )}
      </Stack>
    </>
  );
}

function SourceRow({ source, canManage, onSaved }: { source: LeadSourceJson; canManage: boolean; onSaved: (row: LeadSourceJson) => void }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(source.name);
  const action = useAction();
  const save = (body: { name?: string; hidden?: boolean }) =>
    action.run(async () => {
      onSaved(await api<LeadSourceJson>(`/clients/lead-sources/${source.id}`, { method: "PUT", body }));
      setRenaming(false);
    });

  if (renaming)
    return (
      <li className="px-4 py-3 sm:px-5">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void save({ name });
          }}
        >
          <div className="flex-1">
            <Field label="Name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => (setRenaming(false), setName(source.name))}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || action.busy}>
              Save
            </Button>
          </div>
        </form>
        <Alert variant="error">{action.error}</Alert>
      </li>
    );

  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("font-semibold break-words", source.hidden && "text-muted-foreground")}>{source.name}</span>
        <span className="text-sm text-muted-foreground">
          {[source.clientCount === 1 ? "1 client" : `${source.clientCount} clients`, source.isReferral ? "Asks who referred them" : null].filter(Boolean).join(" · ")}
        </span>
        {action.error && <span className="text-sm font-semibold text-destructive">{action.error}</span>}
      </span>
      {canManage && (
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => setRenaming(true)}>
            Rename
          </Button>
          <Button variant="outline" disabled={action.busy} onClick={() => void save({ hidden: !source.hidden })}>
            {source.hidden ? "Show" : "Hide"}
          </Button>
        </div>
      )}
    </li>
  );
}
