"use client";

// Start a job (docs/stage-2-projects.md §1g). For a house, the address is
// enough: its private site is found or made, and an archived one comes back
// with its history. For a managed site, pick the buildings and levels.

import { useEffect, useState } from "react";
import { Alert, Button, Field, FormActions, Icon, PageHeader, Section, Stack, api, useAction, useApi } from "@grid/ui";
import { CoversPicker, type Cover } from "./CoversPicker";

interface Site {
  id: string;
  name: string;
  address: string;
  kind: "MANAGED" | "PRIVATE";
  buildings: { id: string; name: string; kind: "MULTI" | "SINGLE"; levels: { id: string; name: string; shortName: string }[] }[];
}

interface AddressCheck {
  siteId: string;
  name: string;
  archived: boolean;
  activeJobs: number;
  totalJobs: number;
}

/** Covers start empty unless there's only one obvious answer. */
function defaultCovers(site: Site | null): Cover[] {
  if (site?.buildings.length === 1 && site.buildings[0]!.kind === "SINGLE") return [{ buildingId: site.buildings[0]!.id, levelId: null }];
  return [];
}

export function NewJobForm({ site }: { site: Site | null }) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [address, setAddress] = useState("");
  const [covers, setCovers] = useState<Cover[]>(defaultCovers(site));
  const [check, setCheck] = useState<AddressCheck | null>(null);
  const action = useAction();

  // "You've worked here before": look the address up as it's typed.
  useEffect(() => {
    if (site || address.trim().length < 6) return setCheck(null);
    const timer = setTimeout(async () => {
      try {
        setCheck(await api<AddressCheck | null>(`/projects/address-check?address=${encodeURIComponent(address.trim())}`));
      } catch {
        setCheck(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [address, site]);

  const needsCovers = !!site && !(site.buildings.length === 1 && site.buildings[0]!.kind === "SINGLE");

  return (
    <>
      <PageHeader title="New job" meta={site ? site.name : undefined} />
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const body = {
            name,
            ...(clientName.trim() ? { clientName } : {}),
            ...(jobNumber.trim() ? { jobNumber } : {}),
            ...(site ? { siteId: site.id, covers } : { address }),
          };
          const created = await action.run(() => api<{ id: string }>("/projects", { body }));
          if (created) window.location.href = `/b/projects/${created.id}`;
        }}
      >
        <Stack>
          {!site && (
            <Section title="Where's the job?">
              <div className="flex flex-col gap-3">
                <Field
                  label="Address"
                  autoComplete="street-address"
                  placeholder="12 Smith St, Brunswick VIC 3056"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  required
                />
                {check && (
                  <Alert variant={check.archived ? "success" : "info"}>
                    {check.archived
                      ? `You've worked at ${check.name} before (${check.totalJobs} earlier job${check.totalJobs === 1 ? "" : "s"}). The site comes back from the archive with its history and notes.`
                      : `This goes on your existing site ${check.name}, which has ${check.activeJobs} active job${check.activeJobs === 1 ? "" : "s"}.`}
                  </Alert>
                )}
                <ManagedSitePicker />
              </div>
            </Section>
          )}

          <Section title="The job">
            <div className="flex flex-col gap-4">
              <Field label="Job name" placeholder="e.g. Switchboard upgrade" value={name} onChange={(event) => setName(event.target.value)} required />
              <Field label="Customer" hint="Optional. Lets you find the job by their name." autoComplete="off" value={clientName} onChange={(event) => setClientName(event.target.value)} />
              <Field label="Job number" hint="Leave blank for the next number (J-1001, J-1002…)." autoComplete="off" value={jobNumber} onChange={(event) => setJobNumber(event.target.value)} />
            </div>
          </Section>

          {needsCovers && site && (
            <Section title="What does it cover?" description="Tick the buildings or levels this job works on. You can change it later.">
              <CoversPicker buildings={site.buildings} value={covers} onChange={setCovers} />
            </Section>
          )}

          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="submit" size="lg" disabled={action.busy || (needsCovers && covers.length === 0)}>
              {action.busy ? "Starting…" : "Start job"}
            </Button>
          </FormActions>
        </Stack>
      </form>
    </>
  );
}

/** Jobs at a precinct, centre or school go on its managed site instead of an address. */
function ManagedSitePicker() {
  const [open, setOpen] = useState(false);
  const { data } = useApi<{ id: string; name: string; address: string; kind: string }[]>(open ? "/sites?tab=active" : null);
  const managed = (data ?? []).filter((site) => site.kind === "MANAGED");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-touch self-start text-sm font-semibold text-primary">
        Working at a precinct, centre or school? Pick its site instead
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {data && managed.length === 0 && <p className="text-sm text-muted-foreground">No managed sites yet. A builder or your office sets them up under Sites.</p>}
      {managed.map((site) => (
        <a key={site.id} href={`/b/projects/new/${site.id}`} className="flex min-h-touch items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted">
          <Icon name="building" className="size-5 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block font-semibold">{site.name}</span>
            <span className="block truncate text-sm text-muted-foreground">{site.address}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
