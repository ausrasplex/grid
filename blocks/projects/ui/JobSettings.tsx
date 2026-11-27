"use client";

// Job settings: details (with how the job came in), job number and Covers.

import { useState } from "react";
import { Alert, Button, Field, FormActions, PageHeader, Section, SelectField, Stack, api, useAction } from "@grid/ui";
import { ClientPicker } from "@grid/block-clients/components";
import { CoversPicker, type Cover } from "./CoversPicker";

interface Props {
  job: {
    id: string;
    name: string;
    client: { id: string; name: string } | null;
    /** How this job came in, when it's not the client's own. */
    leadSourceId: string | null;
    jobNumber: string | null;
    covers: Cover[];
  };
  clients: { canPick: boolean; canAdd: boolean };
  /** The business's lead sources (hidden ones only if this job has one), and the job's client's; null when clients can't be seen. */
  leadSources: { options: { id: string; name: string }[]; clientSource: string | null } | null;
  site: { name: string; buildings: { id: string; name: string; kind: "MULTI" | "SINGLE"; levels: { id: string; name: string; shortName: string }[] }[] };
}

export function JobSettings({ job, site, clients, leadSources }: Props) {
  const [name, setName] = useState(job.name);
  const [client, setClient] = useState(job.client);
  const [leadSourceId, setLeadSourceId] = useState(job.leadSourceId ?? "");
  // The client's own only applies while it's the same client.
  const clientSource = client?.id === job.client?.id ? (leadSources?.clientSource ?? null) : null;
  const [jobNumber, setJobNumber] = useState(job.jobNumber ?? "");
  const [covers, setCovers] = useState<Cover[]>(job.covers);
  const action = useAction();
  const simple = site.buildings.length === 1 && site.buildings[0]!.kind === "SINGLE";

  return (
    <>
      <PageHeader title="Job settings" meta={job.name} />
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const ok = await action.run(() =>
            api(`/projects/${job.id}`, {
              method: "PATCH",
              body: {
                name,
                ...(clients.canPick ? { clientId: client?.id ?? null } : {}),
                ...(leadSources ? { leadSourceId: leadSourceId || null } : {}),
                jobNumber,
                ...(simple ? {} : { covers }),
              },
            }),
          );
          if (ok) window.location.href = `/jobs/${job.id}`;
        }}
      >
        <Stack>
          <Section title="Details">
            <div className="flex flex-col gap-4">
              <Field label="Job name" value={name} onChange={(event) => setName(event.target.value)} required />
              {clients.canPick ? (
                <ClientPicker value={client} onChange={setClient} canAdd={clients.canAdd} />
              ) : (
                client && <Field label="Client" value={client.name} readOnly disabled />
              )}
              {leadSources && (
                <SelectField
                  label="How this job came in"
                  hint="Only change it when it's not how the client first found you, like a past client who found you again on Google."
                  options={[
                    { value: "", label: clientSource ? `Same as the client (${clientSource})` : "Same as the client" },
                    ...leadSources.options.map((source) => ({ value: source.id, label: source.name })),
                  ]}
                  value={leadSourceId}
                  onChange={(event) => setLeadSourceId(event.target.value)}
                />
              )}
              <Field label="Job number" value={jobNumber} onChange={(event) => setJobNumber(event.target.value)} required />
            </div>
          </Section>
          {!simple && (
            <Section
              title="What it covers"
              description="Taking a level off never deletes work: anything already on it stays with the job."
            >
              <CoversPicker buildings={site.buildings} value={covers} onChange={setCovers} />
            </Section>
          )}
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button asChild variant="outline" size="lg">
              <a href={`/jobs/${job.id}`}>Cancel</a>
            </Button>
            <Button type="submit" size="lg" disabled={action.busy || (!simple && covers.length === 0)}>
              {action.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </Stack>
      </form>
    </>
  );
}
