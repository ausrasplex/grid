"use client";

// Start a quote: what it's for, who for, where. Lines come next.
// "Where" is an existing site (then its building and floor), or just an
// address. With a site, the job it becomes when accepted goes there.
import { useState } from "react";
import { Alert, Button, Field, FormActions, PageHeader, Section, api, useAction } from "@grid/ui";
import { ClientPicker, type ClientJson } from "@grid/block-clients/components";
import { PlacePicker, type PlaceValue } from "@grid/block-sites/components";

export function NewQuote({
  job,
  place: startPlace,
  client: jobClient,
  canAddClient,
  canPickSite,
}: {
  job: { id: string; name: string; address: string } | null;
  /** Started from an empty building or floor (or nothing): the site, building and floor already picked. */
  place?: PlaceValue | null;
  /** The job's client, to start with. */
  client: ClientJson | null;
  canAddClient: boolean;
  /** May see sites (sites.view): offer the site, building and floor pickers. */
  canPickSite: boolean;
}) {
  const [title, setTitle] = useState(job?.name ?? "");
  const [client, setClient] = useState<ClientJson | null>(jobClient);
  const [place, setPlace] = useState<PlaceValue | null>(startPlace ?? null);
  const [address, setAddress] = useState(job?.address ?? startPlace?.site.address ?? "");
  const [touched, setTouched] = useState(!!job || !!startPlace);
  const action = useAction();
  const building = place?.site.buildings.find((candidate) => candidate.id === place.buildingId);
  const level = building?.levels.find((candidate) => candidate.id === place?.levelId);
  const where = place ? [level ? (level.label ?? level.name) : null, place.site.buildings.length > 1 ? building?.name : null, place.site.name].filter(Boolean).join(" · ") : null;
  return (
    <>
      <PageHeader
        title="New quote"
        subtitle={job ? `For the job ${job.name}.` : where ? `At ${where}. If it's accepted, the job goes here.` : "What it's for, who it's for and where. You'll add the prices next."}
      />
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
                  ...(place && !job ? { siteId: place.site.id, buildingId: place.buildingId, levelId: place.levelId } : {}),
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
          {/* A quote for an existing job is already placed: the job says where. */}
          {!job && canPickSite && (
            <PlacePicker
              value={place}
              hint="If it's at a site you've set up, pick it (and the building and floor). Otherwise just type the address below."
              onChange={(next) => {
                setPlace(next);
                if (next && (!touched || !address.trim())) setAddress(next.site.address);
              }}
            />
          )}
          <Field
            label="Site address"
            hint={place ? "On the quote. Filled in from the site; change it if the quote needs to say something different." : "Where the work is. Needed to make the job when it's accepted."}
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
