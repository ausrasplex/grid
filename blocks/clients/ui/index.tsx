// Clients pages.
//   /clients                 the list: businesses and clients, add either (Settings › Clients)
//   /clients/<id>            one client: their details, and what other Blocks have
//                            with them (panel slot "client.page": active jobs, open quotes)
//   /clients/business/<id>   one business: its details, its people, and everyone's
//                            jobs and quotes (the same "client.page" panels)

import { can, notFound, type RequestContext } from "@grid/core";
import { Alert, Avatar, Icon, List, PageHeader, Section, Stack, type BlockPages, type PanelRenderer } from "@grid/ui";
import { roleLine } from "../people";
import { businessPage, clientPage, listBusinesses, listClients } from "../service";
import type { ClientPagePanelProps } from "../index";
import { BusinessActions, ClientActions } from "./ClientActions";
import { Clients } from "./Clients";

export const pages: BlockPages = {
  "": async ({ ctx, params: [first, second], panels }) => {
    if (first === "business" && second) return <BusinessPage ctx={ctx} businessId={second} panels={panels} />;
    if (first) return <ClientPage ctx={ctx} clientId={first} panels={panels} />;
    const [clients, businesses] = await Promise.all([listClients(ctx), listBusinesses(ctx)]);
    return <Clients initial={clients} initialBusinesses={businesses} canAdd={can(ctx, "clients.add")} />;
  },
};

interface Detail {
  label: string;
  value: string | null;
  href?: string;
  icon?: "phone" | "mail";
  note?: string;
}

function Details({ details, empty }: { details: Detail[]; empty: string }) {
  const shown = details.filter((detail) => detail.value);
  return (
    <Section title="Details" flush>
      {shown.length === 0 ? (
        <p className="px-4 pb-4 text-muted-foreground sm:px-5">{empty}</p>
      ) : (
        <dl className="divide-y">
          {shown.map((detail) => (
            <div key={detail.label} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4 sm:px-5">
              <dt className="w-24 shrink-0 text-sm text-muted-foreground">{detail.label}</dt>
              <dd className="min-w-0 font-medium break-words whitespace-pre-line">
                {detail.href ? (
                  <a href={detail.href} className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline">
                    {detail.icon && <Icon name={detail.icon} className="size-4" />}
                    {detail.value}
                  </a>
                ) : (
                  detail.value
                )}
                {detail.note && <span className="block text-sm font-normal text-muted-foreground">{detail.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  );
}

const phoneHref = (phone: string | null) => (phone ? `tel:${phone.replace(/\s+/g, "")}` : undefined);

async function ClientPage({ ctx, clientId, panels }: { ctx: RequestContext; clientId: string; panels: PanelRenderer }) {
  if (!can(ctx, "clients.view")) throw notFound("Client not found");
  const client = await clientPage(ctx, clientId);
  const props: ClientPagePanelProps = { clientId: client.id, clientName: client.name, clientIds: [client.id] };
  const others = await panels("client.page", { ...props });
  const business = client.business;
  // A person at a business: the business's details fill the gaps, as on their quotes.
  const from = business ? `From ${business.name}` : undefined;
  const phone = client.phone ?? business?.phone ?? null;
  const email = client.email ?? business?.email ?? null;

  const details: Detail[] = [
    { label: "Business", value: business?.name ?? null, href: business ? `/clients/business/${business.id}` : undefined },
    { label: "Role", value: client.role },
    { label: "Contact", value: client.contactName },
    { label: "Phone", value: phone, href: phoneHref(phone), icon: "phone", note: client.phone ? undefined : from },
    { label: "Email", value: email, href: email ? `mailto:${email}` : undefined, icon: "mail", note: client.email ? undefined : from },
    { label: "Address", value: client.address ?? business?.address ?? null, note: client.address ? undefined : from },
    { label: "ABN", value: business?.abn ?? client.abn, note: business?.abn ? from : undefined },
    { label: "Notes", value: client.notes },
  ];

  return (
    <>
      <PageHeader
        title={client.name}
        meta={[roleLine(client), client.contactName, phone].filter(Boolean).join(" · ") || undefined}
        actions={!client.removed && can(ctx, "clients.manage") ? <ClientActions client={client} /> : undefined}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Stack>
          {client.removed && <Alert>This client was removed from the list. Jobs and quotes that name them keep their details.</Alert>}
          {others.length > 0 ? (
            others
          ) : (
            <Section title="Jobs and quotes">
              <p className="text-muted-foreground">Nothing with {client.name} yet.</p>
            </Section>
          )}
        </Stack>
        <Stack>
          <Details details={details} empty="No contact details yet." />
        </Stack>
      </div>
    </>
  );
}

async function BusinessPage({ ctx, businessId, panels }: { ctx: RequestContext; businessId: string; panels: PanelRenderer }) {
  if (!can(ctx, "clients.view")) throw notFound("Business not found");
  const business = await businessPage(ctx, businessId);
  const props: ClientPagePanelProps = { clientId: business.id, clientName: business.name, clientIds: business.everyoneIds };
  const others = await panels("client.page", { ...props });
  const { people, everyoneIds: _everyone, removed: _removed, ...row } = business;

  return (
    <>
      <PageHeader
        title={business.name}
        meta={[business.peopleCount === 1 ? "1 person" : `${business.peopleCount} people`, business.phone].filter(Boolean).join(" · ")}
        actions={!business.removed && (can(ctx, "clients.manage") || can(ctx, "clients.add")) ? <BusinessActions business={row} canManage={can(ctx, "clients.manage")} canAdd={can(ctx, "clients.add")} /> : undefined}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Stack>
          {business.removed && <Alert>This business was removed from the list.</Alert>}
          <Section title="People" description="Quotes and jobs go to a person here. Their own phone and email come first; the business's fill the gaps." flush>
            {people.length === 0 ? (
              <p className="px-4 pb-4 text-muted-foreground sm:px-5">Nobody added yet. Add the people you deal with, like the Project Manager or a Service Technician.</p>
            ) : (
              <List>
                {people.map((person) => (
                  <li key={person.id}>
                    <a href={`/clients/${person.id}`} className="flex min-h-touch-lg items-center gap-3 px-4 py-2.5 hover:bg-muted active:bg-muted sm:px-5">
                      <Avatar name={person.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{person.name}</span>
                        <span className="block truncate text-sm text-muted-foreground">{[person.role, person.phone, person.email].filter(Boolean).join(" · ") || "No details yet"}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </List>
            )}
          </Section>
          {others.length > 0 ? (
            others
          ) : (
            <Section title="Jobs and quotes">
              <p className="text-muted-foreground">Nothing with anyone at {business.name} yet.</p>
            </Section>
          )}
        </Stack>
        <Stack>
          <Details
            empty="No details yet."
            details={[
              { label: "ABN", value: business.abn },
              { label: "Phone", value: business.phone, href: phoneHref(business.phone), icon: "phone" },
              { label: "Email", value: business.email, href: business.email ? `mailto:${business.email}` : undefined, icon: "mail" },
              { label: "Address", value: business.address },
              { label: "Notes", value: business.notes },
            ]}
          />
        </Stack>
      </div>
    </>
  );
}
