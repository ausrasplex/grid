// Clients pages.
//   /clients        the list: add clients, tap one to open it (Settings › Clients)
//   /clients/<id>   one client: their details, and what other Blocks have
//                   with them (panel slot "client.page": active jobs, open quotes)

import { can, notFound, type RequestContext } from "@grid/core";
import { Alert, Icon, PageHeader, Section, Stack, type BlockPages, type PanelRenderer } from "@grid/ui";
import { clientPage, listClients } from "../service";
import type { ClientPagePanelProps } from "../index";
import { ClientActions } from "./ClientActions";
import { Clients } from "./Clients";

export const pages: BlockPages = {
  "": async ({ ctx, params: [clientId], panels }) => {
    if (clientId) return <ClientPage ctx={ctx} clientId={clientId} panels={panels} />;
    return <Clients initial={await listClients(ctx)} canAdd={can(ctx, "clients.add")} />;
  },
};

async function ClientPage({ ctx, clientId, panels }: { ctx: RequestContext; clientId: string; panels: PanelRenderer }) {
  if (!can(ctx, "clients.view")) throw notFound("Client not found");
  const client = await clientPage(ctx, clientId);
  const props: ClientPagePanelProps = { clientId: client.id, clientName: client.name };
  const others = await panels("client.page", { ...props });

  const details: { label: string; value: string | null; href?: string }[] = [
    { label: "Contact", value: client.contactName },
    { label: "Phone", value: client.phone, href: client.phone ? `tel:${client.phone.replace(/\s+/g, "")}` : undefined },
    { label: "Email", value: client.email, href: client.email ? `mailto:${client.email}` : undefined },
    { label: "Address", value: client.address },
    { label: "ABN", value: client.abn },
    { label: "Notes", value: client.notes },
  ];
  const shown = details.filter((detail) => detail.value);

  return (
    <>
      <PageHeader
        title={client.name}
        meta={[client.contactName, client.phone].filter(Boolean).join(" · ") || undefined}
        actions={!client.removed && can(ctx, "clients.manage") ? <ClientActions client={client} /> : undefined}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Stack>
          {client.removed && <Alert>This client was removed from the list. Jobs and quotes that name them keep their details.</Alert>}
          {others.length > 0 ? others : <Section title="Jobs and quotes"><p className="text-muted-foreground">Nothing with {client.name} yet.</p></Section>}
        </Stack>
        <Stack>
          <Section title="Details" flush>
            {shown.length === 0 ? (
              <p className="px-4 pb-4 text-muted-foreground sm:px-5">No contact details yet.</p>
            ) : (
              <dl className="divide-y">
                {shown.map((detail) => (
                  <div key={detail.label} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4 sm:px-5">
                    <dt className="w-24 shrink-0 text-sm text-muted-foreground">{detail.label}</dt>
                    <dd className="min-w-0 font-medium break-words whitespace-pre-line">
                      {detail.href ? (
                        <a href={detail.href} className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline">
                          <Icon name={detail.label === "Phone" ? "phone" : "mail"} className="size-4" />
                          {detail.value}
                        </a>
                      ) : (
                        detail.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>
        </Stack>
      </div>
    </>
  );
}
