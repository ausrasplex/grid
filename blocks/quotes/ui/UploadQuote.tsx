"use client";

// Upload a quote made outside Grid (another program, Word, a template):
// its PDF plus the few details Grid needs to track it. From the Quotes list,
// or "Attach a quote PDF" on a job that has no quote.

import { useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { AddressField, Alert, Button, Field, FormActions, PageHeader, Section, SelectField, api, useAction } from "@grid/ui";
import { ClientPicker, type ClientJson } from "@grid/block-clients/components";
import { PlacePicker, type PlaceValue } from "@grid/block-sites/components";

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/** Sends the PDF to /api/files; returns its id. */
async function uploadPdf(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/files", { method: "POST", body: form, credentials: "same-origin" });
  const body = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok || !body?.id) throw new Error(body?.error?.message ?? "Couldn't upload the PDF");
  return body.id;
}

export function UploadQuote({
  job,
  client: jobClient,
  canAddClient,
  canPickSite,
}: {
  /** Attaching to an existing job. */
  job: { id: string; name: string; address: string } | null;
  client: ClientJson | null;
  canAddClient: boolean;
  /** May see sites (sites.view): offer the site, building and floor pickers. */
  canPickSite: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(job?.name ?? "");
  const [number, setNumber] = useState("");
  const [client, setClient] = useState<ClientJson | null>(jobClient);
  const [total, setTotal] = useState("");
  const [address, setAddress] = useState(job?.address ?? "");
  const [place, setPlace] = useState<PlaceValue | null>(null);
  const [sentOn, setSentOn] = useState(today());
  const [status, setStatus] = useState<"SENT" | "ACCEPTED">(job ? "ACCEPTED" : "SENT");
  const picker = useRef<HTMLInputElement>(null);
  const action = useAction();

  return (
    <>
      <PageHeader
        title={job ? "Attach a quote PDF" : "Upload a quote"}
        subtitle={
          job
            ? `For the job ${job.name}: a quote you made outside Grid.`
            : "A quote you made outside Grid. Attach its PDF and Grid keeps track of it with your other quotes."
        }
      />
      <Section>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!file) return action.setError("Choose the quote's PDF first");
            const created = await action.run(async () => {
              const fileId = await uploadPdf(file);
              const amount = total.trim() ? Number(total.replace(/[$,\s]/g, "")) : null;
              if (amount !== null && !Number.isFinite(amount)) throw new Error("Check the total: just the number, e.g. 4180.00");
              return api<{ id: string }>("/quotes/upload", {
                body: {
                  fileId,
                  title,
                  number: number.trim() || null,
                  clientId: client?.id ?? null,
                  total: amount,
                  siteAddress: address.trim() || null,
                  sentOn,
                  status,
                  projectId: job?.id ?? null,
                  ...(place && !job ? { siteId: place.site.id, buildingId: place.buildingId, levelId: place.levelId } : {}),
                },
              });
            });
            if (created) window.location.href = `/quotes/${created.id}`;
          }}
        >
          <div className="flex flex-col gap-2 lg:max-w-2xl">
            <span className="text-sm font-medium">Quote PDF</span>
            <input
              ref={picker}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null;
                setFile(chosen);
                // The file name often is the quote number ("Q-2231.pdf").
                if (chosen && !number) {
                  const fromName = chosen.name.replace(/\.pdf$/i, "").match(/\b[A-Z]{0,4}-?\d{2,}\b/i)?.[0];
                  if (fromName) setNumber(fromName.toUpperCase());
                }
              }}
            />
            <button
              type="button"
              onClick={() => picker.current?.click()}
              className="flex min-h-touch-lg items-center gap-3 rounded-lg border-2 border-dashed border-input px-4 py-3 text-left hover:bg-muted"
            >
              {file ? <FileText className="size-6 shrink-0 text-primary" /> : <Upload className="size-6 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{file ? file.name : "Choose the PDF"}</span>
                <span className="block text-sm text-muted-foreground">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · tap to change` : "From this phone or computer"}</span>
              </span>
            </button>
          </div>
          <Field label="What's it for?" placeholder="e.g. Switchboard upgrade" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <Field label="Quote number" hint="As on the PDF. Leave blank for the next number." value={number} onChange={(event) => setNumber(event.target.value)} autoComplete="off" />
          <ClientPicker value={client} onChange={(value) => (setClient(value), value?.address && !address && setAddress(value.address))} canAdd={canAddClient} />
          {/* For a job, the job says where. */}
          {!job && canPickSite && (
            <PlacePicker
              value={place}
              hint="If it's at a site you've set up, pick it (and the building and floor). Otherwise just type the address below."
              onChange={(next) => {
                setPlace(next);
                if (next && !address.trim()) setAddress(next.site.address);
              }}
            />
          )}
          <Field label="Total (incl. tax)" inputMode="decimal" placeholder="e.g. 4180.00" value={total} onChange={(event) => setTotal(event.target.value)} />
          <AddressField
            label="Site address"
            hint={job ? undefined : "Where the work is. Needed to make the job when it's accepted."}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
          <Field label="Date sent" type="date" value={sentOn} onChange={(event) => setSentOn(event.target.value)} />
          <SelectField
            label="Where it's at"
            value={status}
            onChange={(event) => setStatus(event.target.value as "SENT" | "ACCEPTED")}
            options={[
              { value: "SENT", label: "Sent, waiting for an answer" },
              { value: "ACCEPTED", label: "Accepted" },
            ]}
          />
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="submit" size="lg" disabled={action.busy || !file || !title.trim()}>
              {action.busy ? "Uploading…" : job ? "Attach to the job" : "Upload quote"}
            </Button>
          </FormActions>
        </form>
      </Section>
    </>
  );
}
