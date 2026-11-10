"use client";

// A managed site: a precinct, shopping centre, school or block of units.
// (Houses don't need this: a job's address makes its site automatically.)

import { useState } from "react";
import { Alert, Button, Field, FormActions, PageHeader, Section, api, useAction } from "@grid/ui";

export function NewSiteForm() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const action = useAction();
  return (
    <>
      <PageHeader
        title="New site"
        subtitle="For precincts, centres, schools and multi-storey jobs. Set out its buildings and levels next. A house doesn't need this: starting a job at the address makes its site."
      />
      <Section>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const site = await action.run(() => api<{ id: string }>("/sites", { body: { name, address } }));
            if (site) window.location.href = `/b/sites/${site.id}/structure`;
          }}
        >
          <Field label="Site name" placeholder="e.g. Riverside Health Precinct" value={name} onChange={(event) => setName(event.target.value)} required />
          <Field label="Address" autoComplete="street-address" value={address} onChange={(event) => setAddress(event.target.value)} required />
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
