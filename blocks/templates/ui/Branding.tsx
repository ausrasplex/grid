"use client";

// Settings › Branding: the logo, colour and business details on every
// quote and report. "See a sample PDF" shows the result.

import { useRef, useState } from "react";
import { Alert, Button, Field, FormActions, PageHeader, Section, Stack, api, useAction } from "@grid/ui";

interface Theme {
  companyName: string;
  logoFileId: string | null;
  accentColor: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  licenceLabel: string | null;
  licenceNumber: string | null;
  footerText: string | null;
}

// Dark enough to read as white-on-colour table headers.
const SWATCHES = ["#b45309", "#1d4ed8", "#047857", "#b91c1c", "#6d28d9", "#0f766e", "#334155", "#111827"];

export function Branding({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState(initial);
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const save = useAction();
  const upload = useAction();
  const set = <K extends keyof Theme>(field: K, value: Theme[K]) => {
    setTheme({ ...theme, [field]: value });
    setSaved(false);
  };
  const text = (field: keyof Theme, label: string, extra: Record<string, unknown> = {}) => (
    <Field label={label} value={(theme[field] as string | null) ?? ""} onChange={(event) => set(field, event.target.value as never)} {...extra} />
  );

  return (
    <>
      <PageHeader title="Branding" subtitle="Your logo, colour and details on quotes and reports." />
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const { companyName: _c, ...body } = theme;
          const updated = await save.run(() => api<Theme>("/templates/theme", { method: "PUT", body }));
          if (updated) {
            setTheme(updated);
            setSaved(true);
          }
        }}
      >
        <Stack>
          <Section title="Logo" description="A PNG with a transparent background looks best. It's printed at the top left.">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-40 items-center justify-center rounded-lg bg-white p-2">
                {theme.logoFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${theme.logoFileId}?v=original`} alt="Logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-sm text-neutral-500">No logo</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button type="button" variant="outline" disabled={upload.busy} onClick={() => fileInput.current?.click()}>
                  {upload.busy ? "Uploading…" : theme.logoFileId ? "Change logo" : "Upload logo"}
                </Button>
                {theme.logoFileId && (
                  <Button type="button" variant="ghost" onClick={() => set("logoFileId", null)}>
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  upload.run(async () => {
                    const form = new FormData();
                    form.append("file", file, file.name);
                    const response = await fetch("/api/files", { method: "POST", body: form });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data?.error?.message ?? "Upload failed");
                    set("logoFileId", data.id);
                    return true;
                  });
                }}
              />
            </div>
            <div className="mt-2">
              <Alert variant="error">{upload.error}</Alert>
            </div>
          </Section>

          <Section title="Colour" description="Used for the title, table headings and the totals line.">
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  aria-label={`Colour ${colour}`}
                  aria-pressed={theme.accentColor === colour}
                  onClick={() => set("accentColor", colour)}
                  className="size-11 rounded-full border-4"
                  style={{ background: colour, borderColor: theme.accentColor === colour ? "var(--color-primary)" : "transparent" }}
                />
              ))}
              <label className="ml-2 flex items-center gap-2 text-sm">
                Other
                <input type="color" value={theme.accentColor} onChange={(event) => set("accentColor", event.target.value)} className="h-11 w-14 rounded" />
              </label>
            </div>
          </Section>

          <Section title="Details on documents" description={`Printed under ${theme.companyName}. Change the business name in Business details.`}>
            <div className="grid gap-4 sm:grid-cols-2">
              {text("phone", "Phone", { type: "tel", autoComplete: "tel" })}
              {text("email", "Email", { type: "email" })}
              <div className="sm:col-span-2">{text("address", "Address", { autoComplete: "street-address" })}</div>
              {text("website", "Website")}
              <div className="grid grid-cols-[8rem_1fr] gap-2">
                {text("licenceLabel", "Licence label", { placeholder: "REC" })}
                {text("licenceNumber", "Licence number")}
              </div>
              <div className="sm:col-span-2">{text("footerText", "Footer", { hint: "Small print on every page, e.g. payment details." })}</div>
            </div>
          </Section>

          <Alert variant="error">{save.error}</Alert>
          {saved && <Alert variant="success">Saved. New PDFs use it straight away; quotes already sent keep the look they had.</Alert>}
          <FormActions>
            <Button asChild type="button" variant="outline" size="lg">
              <a href="/api/templates/sample.pdf" target="_blank" rel="noreferrer">See a sample PDF</a>
            </Button>
            <Button type="submit" size="lg" disabled={save.busy}>
              {save.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </Stack>
      </form>
    </>
  );
}
