"use client";

// Settings › Accounts & devices (server admin): every business on the server,
// with Delete and Restore (docs/roadmap.md "Deleting a business").

import { Alert, Avatar, Badge, Button, EmptyState, List, ListRow, Loading, Section, api, useAction, useApi } from "@grid/ui";

interface Business {
  id: string;
  name: string;
  createdAt: string;
  people: number;
  owners: string[];
  deletedAt: string | null;
  removedOn: string | null;
}

const when = (value: string) => new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function ServerBusinesses() {
  const { data, error, loading, reload } = useApi<Business[]>("/server/businesses");
  const action = useAction();

  const change = (business: Business, deleting: boolean) => {
    const question = deleting
      ? `Delete ${business.name}? Everyone in it (${business.people} ${business.people === 1 ? "person" : "people"}) loses access straight away. It can be restored here until it's removed for good.`
      : `Restore ${business.name}? Everyone in it gets access back.`;
    if (!confirm(question)) return;
    void action.run(async () => {
      await api("/server/businesses", { body: { companyId: business.id, action: deleting ? "delete" : "restore" } });
      await reload();
    });
  };

  if (loading && !data) return <Loading rows={3} />;
  if (error || !data) return <Alert variant="error">{error ?? "Couldn't load the businesses"}</Alert>;
  const live = data.filter((business) => !business.deletedAt).length;

  return (
    <Section
      title={`${data.length} ${data.length === 1 ? "business" : "businesses"}`}
      description={data.length === live ? "Every business on this server." : `${live} in use, ${data.length - live} deleted (restorable until removed for good).`}
      flush
    >
      <Alert variant="error">{action.error}</Alert>
      {data.length === 0 ? (
        <div className="px-4 pb-4 sm:px-5">
          <EmptyState title="No businesses yet" />
        </div>
      ) : (
        <List>
          {data.map((business) => (
            <ListRow
              key={business.id}
              title={
                <span className="flex items-center gap-3">
                  <Avatar name={business.name} className="rounded-xl" />
                  {business.name}
                </span>
              }
              badges={business.deletedAt ? <Badge variant="destructive">Deleted</Badge> : undefined}
              meta={
                business.deletedAt && business.removedOn
                  ? `Deleted ${when(business.deletedAt)} · removed for good ${when(business.removedOn)}`
                  : `${business.people} ${business.people === 1 ? "person" : "people"}${business.owners.length ? ` · Owner: ${business.owners.join(", ")}` : ""} · since ${when(business.createdAt)}`
              }
              actions={
                business.deletedAt ? (
                  <Button variant="outline" disabled={action.busy} onClick={() => change(business, false)}>
                    Restore
                  </Button>
                ) : (
                  <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" disabled={action.busy} onClick={() => change(business, true)}>
                    Delete
                  </Button>
                )
              }
            />
          ))}
        </List>
      )}
    </Section>
  );
}
