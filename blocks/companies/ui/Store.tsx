"use client";

import { Alert, Badge, List, Loading, PageHeader, Section, Stack, Switch, api, useAction, useApi } from "@grid/ui";

interface BlockRow {
  id: string;
  name: string;
  description: string;
  version: string;
  required: boolean;
  chosen: boolean;
  active: boolean;
  dependsOn: string[];
  blockedBy: string[];
}

export function Store() {
  const { data, error, loading } = useApi<BlockRow[]>("/companies/current/blocks");
  const action = useAction();

  const meta = data ? `${data.filter((block) => block.active).length} of ${data.length} on` : undefined;
  const header = <PageHeader title="Store" meta={meta} subtitle="Add or remove Blocks for everyone in this business." />;

  if (loading) return <>{header}<Loading rows={4} /></>;
  if (error || !data) return <>{header}<Alert variant="error">{error ?? "Couldn't load blocks"}</Alert></>;

  const nameOf = (id: string) => data.find((block) => block.id === id)?.name ?? id;

  return (
    <>
    {header}
    <Stack>
      <Alert variant="error">{action.error}</Alert>
      <Section flush>
        <List>
          {data.map((block) => {
            const id = `block-${block.id}`;
            return (
              <li key={block.id}>
                <label htmlFor={id} className="flex min-h-touch-lg cursor-pointer items-center gap-4 px-4 py-3 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{block.name}</span>
                      {block.required && <Badge>Core</Badge>}
                      {block.chosen && !block.active && <Badge variant="warning">Waiting on {block.blockedBy.map(nameOf).join(", ")}</Badge>}
                    </span>
                    {block.description && <span className="mt-0.5 block text-sm text-muted-foreground">{block.description}</span>}
                    {block.dependsOn.length > 0 && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">Needs: {block.dependsOn.map(nameOf).join(", ")}</span>
                    )}
                  </span>
                  <Switch
                    id={id}
                    checked={block.chosen}
                    disabled={block.required || action.busy}
                    aria-label={`${block.name} ${block.chosen ? "on" : "off"}`}
                    onCheckedChange={async (enabled) => {
                      const ok = await action.run(() => api(`/companies/current/blocks/${block.id}`, { method: "PUT", body: { enabled } }));
                      if (ok) window.location.reload(); // menus change with blocks
                    }}
                  />
                </label>
              </li>
            );
          })}
        </List>
      </Section>
    </Stack>
    </>
  );
}
