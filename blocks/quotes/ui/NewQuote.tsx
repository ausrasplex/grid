"use client";

// Start a quote: what it's for, who for, where. Lines come next.
import { useState } from "react";
import { Alert, Button, Field, FormActions, PageHeader, Section, api, useAction } from "@grid/ui";
import { ClientPicker, type ClientJson } from "@grid/block-clients/components";

export function NewQuote({
  job,
  place,
  client: jobClient,
  canAddClient,
}: {
  job: { id: string; name: string; address: string } | null;
  /** Started from an empty floor: where the job will go if it's accepted. */
  place?: { siteId: string; buildingId: string | null; levelId: string | null; label: string; address: string };
  /** The job's client, to start with. */
  client: ClientJson | null;
  canAddClient: boolean;
}) {
  const [title, setTitle] = useState(job?.name ?? "");
  const [client, setClient] = useState<ClientJson | null>(jobClient);
  const [address, setAddress] = useState(job?.address ?? place?.address ?? "");
  const [touched, setTouched] = useState(!!job || !!place);
  const action = useAction();
  return (
    <>
      <PageHeader title="New quote" subtitle={job ? `For the job ${job.name}.` : place ? `At ${place.label}. If it's accepted, the job goes here.` : "What it's for and who it's for. You'll add the prices next."} />
      <Section>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const created = await action.run(() =>
              api<{ id: string }>("/quotes", {
                body: {
                  title,
                  clientId: client?.id ?? null,
                  siteAddress: address || null,
                  projectId: job?.id ?? null,
                  ...(place ? { siteId: place.siteId, buildingId: place.buildingId, levelId: place.levelId } : {}),
                },
              }),
            );
            if (created) window.location.href = `/quotes/${created.id}`;
          }}
        >
          <Field label="What's the job?" placeholder="e.g. Switchboard upgrade" value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus />
          <ClientPicker
            value={client}
            canAdd={canAddClient}
            onChange={(value) => {
              setClient(value);
              if (value?.address && !touched) setAddress(value.address);
            }}
          />
          <Field
            label="Site address"
            hint="Where the work is. Needed to make the job when it's accepted."
            autoComplete="street-address"
            value={address}
            onChange={(event) => (setAddress(event.target.value), setTouched(true))}
          />
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="submit" size="lg" disabled={action.busy}>
              {action.busy ? "Starting…" : "Start quote"}
            </Button>
          </FormActions>
        </form>
      </Section>
    </>
  );
}
