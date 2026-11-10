"use client";

// Settings › Tax & currency. Nothing in Grid assumes GST: the tax name,
// rates, currency and number format all come from here.
import { useState } from "react";
import { Alert, Button, Field, FormActions, Label, List, PageHeader, Section, Segmented, SelectField, Sheet, SheetContent, Stack, Switch, TapRow, api, useAction } from "@grid/ui";

interface Code {
  id: string;
  name: string;
  label: string;
  ratePct: number;
  active: boolean;
}

export interface TaxSettingsJson {
  taxName: string;
  pricesIncludeTax: boolean;
  registrationLabel: string;
  currency: string;
  locale: string;
  rounding: "LINE" | "TOTAL";
  documentTitle: string;
  defaultTaxCodeId: string | null;
  quotePrefix: string;
  validityDays: number;
  defaultTerms: string | null;
  onlineAccept: boolean;
  signDrawn: boolean;
  signTyped: boolean;
  codes: Code[];
}

export function TaxSettingsForm({ initial }: { initial: TaxSettingsJson }) {
  const [settings, setSettings] = useState(initial);
  const [form, setForm] = useState({ ...initial, defaultTerms: initial.defaultTerms ?? "", validityDays: String(initial.validityDays) });
  const [code, setCode] = useState<Partial<Code> | null>(null);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  return (
    <>
      <PageHeader title="Tax & currency" subtitle="How tax shows on your quotes. Already-sent quotes keep the settings they were sent with." />
      <Stack>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaved(false);
            const result = await action.run(() =>
              api<TaxSettingsJson>("/quotes/settings", {
                method: "PUT",
                body: {
                  taxName: form.taxName,
                  pricesIncludeTax: form.pricesIncludeTax,
                  registrationLabel: form.registrationLabel,
                  currency: form.currency,
                  locale: form.locale,
                  rounding: form.rounding,
                  documentTitle: form.documentTitle,
                  defaultTaxCodeId: form.defaultTaxCodeId || null,
                  quotePrefix: form.quotePrefix,
                  validityDays: Number(form.validityDays) || 30,
                  defaultTerms: form.defaultTerms,
                  onlineAccept: form.onlineAccept,
                  signDrawn: form.signDrawn,
                  signTyped: form.signTyped,
                },
              }),
            );
            if (result) (setSettings(result), setSaved(true));
          }}
        >
          <Section title="Tax">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tax name" hint="GST, VAT…" value={form.taxName} onChange={(event) => setForm({ ...form, taxName: event.target.value })} required />
                <Field label="Business number label" hint="ABN, NZBN…" value={form.registrationLabel} onChange={(event) => setForm({ ...form, registrationLabel: event.target.value })} />
              </div>
              <SelectField
                label="Default tax for new lines"
                value={form.defaultTaxCodeId ?? ""}
                onChange={(event) => setForm({ ...form, defaultTaxCodeId: event.target.value || null })}
                options={[{ value: "", label: "No tax" }, ...settings.codes.filter((code) => code.active).map((code) => ({ value: code.id, label: code.name }))]}
              />
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="block font-medium">Type prices including {form.taxName || "tax"}</span>
                  <span className="block text-sm text-muted-foreground">For new quotes. Most trades quote ex tax.</span>
                </span>
                <Switch checked={form.pricesIncludeTax} onCheckedChange={(checked) => setForm({ ...form, pricesIncludeTax: checked })} />
              </label>
              <div className="flex flex-col gap-2">
                <Label>Round tax</Label>
                <Segmented
                  label="Round tax"
                  value={form.rounding}
                  onChange={(value) => setForm({ ...form, rounding: value })}
                  items={[
                    { value: "LINE", label: "On each line" },
                    { value: "TOTAL", label: "On the total" },
                  ]}
                />
              </div>
            </div>
          </Section>
          <Section title="Currency and quotes">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency" hint="AUD, NZD, GBP…" maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} required />
              <Field label="Number format" hint="en-AU, en-NZ…" value={form.locale} onChange={(event) => setForm({ ...form, locale: event.target.value })} required />
              <Field label="Document title" hint="Quote, Estimate…" value={form.documentTitle} onChange={(event) => setForm({ ...form, documentTitle: event.target.value })} required />
              <Field label="Number prefix" hint="Q- gives Q-1001" value={form.quotePrefix} onChange={(event) => setForm({ ...form, quotePrefix: event.target.value })} />
              <Field label="Valid for (days)" inputMode="numeric" value={form.validityDays} onChange={(event) => setForm({ ...form, validityDays: event.target.value })} />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Label htmlFor="terms">Standard terms</Label>
              <textarea
                id="terms"
                rows={6}
                value={form.defaultTerms}
                onChange={(event) => setForm({ ...form, defaultTerms: event.target.value })}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-sm text-muted-foreground">Added to every new quote. You can change them on each quote.</p>
            </div>
          </Section>
          <Section title="Accepting online" description="Quote emails include a private link where the customer can read the quote, tick extras, and sign or decline. They confirm with a code emailed to them.">
            <div className="flex flex-col gap-4">
              <label className="flex items-center justify-between gap-3">
                <span className="font-medium">Let customers accept and sign online</span>
                <Switch checked={form.onlineAccept} onCheckedChange={(checked) => setForm({ ...form, onlineAccept: checked })} />
              </label>
              {form.onlineAccept && (
                <>
                  <label className="flex items-center justify-between gap-3">
                    <span>Sign by drawing (finger or mouse)</span>
                    <Switch checked={form.signDrawn} onCheckedChange={(checked) => setForm({ ...form, signDrawn: checked })} />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    <span>Sign by typing their name</span>
                    <Switch checked={form.signTyped} onCheckedChange={(checked) => setForm({ ...form, signTyped: checked })} />
                  </label>
                </>
              )}
            </div>
          </Section>
          <Alert variant="error">{action.error}</Alert>
          <Alert variant="success">{saved && "Saved."}</Alert>
          <FormActions>
            <Button type="submit" size="lg" disabled={action.busy}>
              {action.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </form>

        <Section flush title="Tax rates" actions={<Button variant="outline" size="sm" onClick={() => setCode({ active: true })}>Add rate</Button>}>
          <List>
            {settings.codes.map((code) => (
              <TapRow key={code.id} title={code.name} meta={`${code.label} · ${code.ratePct}%${code.active ? "" : " · Not used"}`} onClick={() => setCode(code)} />
            ))}
          </List>
        </Section>
      </Stack>
      {code && <CodeSheet code={code} onClose={() => setCode(null)} onSaved={(saved) => (setSettings(saved), setCode(null))} />}
    </>
  );
}

function CodeSheet({ code, onClose, onSaved }: { code: Partial<Code>; onClose: () => void; onSaved: (settings: TaxSettingsJson) => void }) {
  const [form, setForm] = useState({ name: code.name ?? "", label: code.label ?? "", ratePct: code.ratePct == null ? "" : String(code.ratePct), active: code.active ?? true });
  const action = useAction();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title={code.id ? "Tax rate" : "New tax rate"} description="A rate in use can't be deleted (old quotes need it), but you can stop using it.">
        <form
          className="flex flex-col gap-3 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const body = { name: form.name, label: form.label || form.name, ratePct: Number(form.ratePct) || 0, active: form.active };
            const result = await action.run(() =>
              code.id ? api<TaxSettingsJson>(`/quotes/settings/codes/${code.id}`, { method: "PUT", body }) : api<TaxSettingsJson>("/quotes/settings/codes", { body }),
            );
            if (result) onSaved(result);
          }}
        >
          <Field label="Name" placeholder="e.g. GST 10%" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          <Field label="Label on documents" placeholder="e.g. GST" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
          <Field label="Rate %" inputMode="decimal" value={form.ratePct} onChange={(event) => setForm({ ...form, ratePct: event.target.value })} required />
          <label className="flex items-center justify-between gap-3">
            <span className="font-medium">In use</span>
            <Switch checked={form.active} onCheckedChange={(checked) => setForm({ ...form, active: checked })} />
          </label>
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="submit" disabled={action.busy}>
              Save
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}
