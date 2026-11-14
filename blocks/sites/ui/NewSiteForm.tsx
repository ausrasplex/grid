"use client";

// A managed site: a precinct, shopping centre, school or block of units, set
// out before any job there. (A house doesn't need this: a job's address makes
// its site automatically.) Shown to sole traders as well as teams.

import { useState } from "react";
import { AddressField, Alert, Button, Field, FormActions, PageHeader, Section, api, useAction } from "@grid/ui";

export function NewSiteForm() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const action = useAction();
  return (
    <>
      <PageHeader
        title="New site"
        subtitle="Set a site up before any jobs there: a precinct, centre, school or multi-storey build. You set out its buildings and levels next. A house doesn't need this: starting a job at the address makes its site."
      />
      <Section>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const site = await action.run(() => api<{ id: string }>("/sites", { body: { name, address } }));
            if (site) window.location.href = `/sites/${site.id}/structure`;
          }}
        >
          <Field label="Site name" placeholder="e.g. Riverside Health Precinct" value={name} onChange={(event) => setName(event.target.value)} required />
          <AddressField label="Address" value={address} onChange={(event) => setAddress(event.target.value)} required />
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="submit" size="lg" disabled={action.busy}>
              {action.busy ? "Creating…" : "Create site"}
            </Button>
          </FormActions>
        </form>
      </Section>
    </>
  );
}
