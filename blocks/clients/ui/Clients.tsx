"use client";

// Clients: the people and businesses you work for, one list for jobs and
// quotes. Businesses (Honeywell) are listed first, with how many people are
// at each; then every client, people at a business showing their role there.
import { useEffect, useState } from "react";
import { ArrowDownUp, Building2, Plus } from "lucide-react";
import { ActionButton, Avatar, EmptyState, List, PageHeader, SearchInput, Section, Segmented, Sheet, SheetContent, Stack, TapRow, api } from "@grid/ui";
import { BusinessForm, ClientForm, roleAt, type BusinessRowJson, type ClientJson } from "./ClientPicker";
import { TransferSheet } from "./ClientTransfer";

type Show = "everyone" | "businesses";

export function Clients({
  initial,
  initialBusinesses,
  canAdd,
  canManage,
  canSeeTeam,
}: {
  initial: ClientJson[];
  initialBusinesses: BusinessRowJson[];
  canAdd: boolean;
  /** Export (and Share our card) is the whole list in one go: Owners. */
  canManage: boolean;
  canSeeTeam: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [businesses, setBusinesses] = useState(initialBusinesses);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("everyone");
  const [editing, setEditing] = useState<Partial<ClientJson> | null>(null);
  const [addingBusiness, setAddingBusiness] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const load = async () => {
    const search = encodeURIComponent(query);
    const [clients, found] = await Promise.all([api<ClientJson[]>(`/clients?q=${search}`), api<BusinessRowJson[]>(`/clients/businesses?q=${search}`)]);
    setRows(clients);
    setBusinesses(found);
  };
  useEffect(() => {
    const timer = setTimeout(() => void load().catch(() => {}), 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const businessList = (
    <List>
      {businesses.map((business) => (
        <TapRow
          key={business.id}
          leading={
            business.logoUrl ? (
              <Avatar name={business.name} src={business.logoUrl} />
            ) : (
              <span className="flex size-10 items-center justify-center rounded-full bg-muted">
                <Building2 className="size-5 text-muted-foreground" />
              </span>
            )
          }
          title={business.name}
          meta={[business.peopleCount === 1 ? "1 person" : `${business.peopleCount} people`, business.phone, business.address].filter(Boolean).join(" · ")}
          onClick={() => (window.location.href = `/clients/business/${business.id}`)}
        />
      ))}
    </List>
  );

  return (
    <>
      <PageHeader
        title="Clients"
        meta={`${rows.length} client${rows.length === 1 ? "" : "s"} · ${businesses.length} business${businesses.length === 1 ? "" : "es"}`}
        actions={
          (canAdd || canManage) && (
            <>
              <ActionButton variant="outline" icon={<ArrowDownUp />} label="Export & import" onClick={() => setTransferOpen(true)} />
              {canAdd && (
                <>
                  <ActionButton icon={<Building2 />} label="Add business" onClick={() => setAddingBusiness(true)} />
                  <ActionButton icon={<Plus />} label="Add client" onClick={() => setEditing({})} />
                </>
              )}
            </>
          )
        }
      />
      <Stack>
        <SearchInput label="Search clients" placeholder="Name, business, email or address" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Segmented<Show>
          label="Show"
          value={show}
          onChange={setShow}
          items={[
            { value: "everyone", label: "Everyone" },
            { value: "businesses", label: "Businesses" },
          ]}
        />
        {show === "businesses" ? (
          <Section flush>
            {businesses.length === 0 ? (
              <EmptyState title={query ? "No businesses match" : "No businesses yet"}>
                {!query && "Add a business when you work for several people there, like a Project Manager and a Service Technician at Honeywell."}
              </EmptyState>
            ) : (
              businessList
            )}
          </Section>
        ) : (
          <>
            {businesses.length > 0 && (
              <Section title="Businesses" flush>
                {businessList}
              </Section>
            )}
            <Section title={businesses.length > 0 ? "Clients" : undefined} flush>
              {rows.length === 0 ? (
                <EmptyState title={query ? "No clients match" : "No clients yet"}>{!query && "Clients are added when you start a job or write a quote, or here."}</EmptyState>
              ) : (
                <List>
                  {rows.map((row) => (
                    <TapRow
                      key={row.id}
                      leading={<Avatar name={row.name} src={row.pictureUrl} />}
                      title={row.name}
                      meta={[roleAt(row), row.contactName, row.email, row.phone, row.address].filter(Boolean).join(" · ") || "No details yet"}
                      onClick={() => (window.location.href = `/clients/${row.id}`)}
                    />
                  ))}
                </List>
              )}
            </Section>
          </>
        )}
      </Stack>
      <TransferSheet open={transferOpen} onClose={() => setTransferOpen(false)} canExport={canManage} canImport={canAdd} canSeeTeam={canSeeTeam} />
      {editing && (
        <Sheet open onOpenChange={(open) => !open && setEditing(null)}>
          <SheetContent desktop="dialog" title={editing.id ? (editing.name ?? "Client") : "New client"}>
            <ClientForm initial={editing} onSaved={async () => (setEditing(null), await load())} />
          </SheetContent>
        </Sheet>
      )}
      {addingBusiness && (
        <Sheet open onOpenChange={(open) => !open && setAddingBusiness(false)}>
          <SheetContent desktop="dialog" title="New business" description="Then add the people there you deal with, each with their role.">
            <BusinessForm initial={{}} onSaved={(business) => (window.location.href = `/clients/business/${business.id}`)} />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
