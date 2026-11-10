"use client";

// Clients: the people and businesses you quote for.
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { ActionButton, Avatar, EmptyState, List, PageHeader, SearchInput, Section, Sheet, SheetContent, Stack, TapRow, api } from "@grid/ui";
import { ClientForm, type ClientJson } from "./ClientPicker";

export function Clients({ initial, canManage, canAdd }: { initial: ClientJson[]; canManage: boolean; canAdd: boolean }) {
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<ClientJson> | null>(null);
  const load = async () => setRows(await api<ClientJson[]>(`/quotes/clients?q=${encodeURIComponent(query)}`));
  useEffect(() => {
    const timer = setTimeout(() => void load().catch(() => {}), 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  return (
    <>
      <PageHeader
        title="Clients"
        meta={`${rows.length} client${rows.length === 1 ? "" : "s"}`}
        actions={canAdd && <ActionButton icon={<Plus />} label="Add client" onClick={() => setEditing({})} />}
      />
      <Stack>
        <SearchInput label="Search clients" placeholder="Name, email or address" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Section flush>
          {rows.length === 0 ? (
            <EmptyState title={query ? "No clients match" : "No clients yet"}>{!query && "Clients are added when you write a quote, or here."}</EmptyState>
          ) : (
            <List>
              {rows.map((row) => (
                <TapRow
                  key={row.id}
                  leading={<Avatar name={row.name} />}
                  title={row.name}
                  meta={[row.contactName, row.email, row.phone, row.address].filter(Boolean).join(" · ") || "No details yet"}
                  onClick={() => canManage && setEditing(row)}
                />
              ))}
            </List>
          )}
        </Section>
      </Stack>
      {editing && (
        <Sheet open onOpenChange={(open) => !open && setEditing(null)}>
          <SheetContent title={editing.id ? editing.name ?? "Client" : "New client"}>
            <ClientForm
              initial={editing}
              onSaved={async () => (setEditing(null), await load())}
              onDelete={
                editing.id
                  ? async () => {
                      if (!window.confirm(`Remove ${editing.name}? Quotes already written keep their details.`)) return;
                      await api(`/quotes/clients/${editing.id}`, { method: "DELETE" });
                      setEditing(null);
                      await load();
                    }
                  : undefined
              }
            />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
