"use client";

// Settings › Handover (docs/materials-block.md §3): the schedule's title,
// and per trade its printed name ("Lighting & Electrical") and which
// optional columns print.

import { useState } from "react";
import { Alert, Button, Field, FormActions, PageHeader, Section, Stack, api, useAction } from "@grid/ui";
import { MATERIAL_TRADES } from "@grid/block-materials/trades";
import { optionalColumns } from "../columns";
import type { CompanySettingsJson } from "./shared";

export function HandoverSettings({ initial }: { initial: CompanySettingsJson }) {
  const [title, setTitle] = useState(initial.title);
  const [tradeNames, setTradeNames] = useState<Record<string, string>>(initial.tradeNames);
  const [hidden, setHidden] = useState<Record<string, string[]>>(initial.tradeColumns);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const toggle = (trade: string, column: string) => {
    const now = hidden[trade] ?? [];
    setHidden({ ...hidden, [trade]: now.includes(column) ? now.filter((key) => key !== column) : [...now, column] });
  };

  return (
    <>
      <PageHeader title="Handover" subtitle="How your handover sheets print. Each job has its own switches too (Sheet settings on the job's Handover page)." />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(false);
          void action.run(async () => {
            const result = await api<CompanySettingsJson>("/handover/settings", { method: "PUT", body: { title, tradeNames, tradeColumns: hidden } });
            setTradeNames(result.tradeNames);
            setHidden(result.tradeColumns);
            setSaved(true);
          });
        }}
      >
        <Stack>
          <Section title="Title">
            <Field label="Title on the cover" value={title} onChange={(event) => setTitle(event.target.value)} required hint="A job can have its own." />
          </Section>
          <Section title="Trades" description="The name each trade prints under (SECTION), and the optional columns. Notes only prints when a line has one.">
            <ul className="flex flex-col divide-y">
              {MATERIAL_TRADES.map((trade) => (
                <li key={trade.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Field label={trade.name} placeholder={trade.name} value={tradeNames[trade.id] ?? ""} onChange={(event) => setTradeNames({ ...tradeNames, [trade.id]: event.target.value })} />
                  </div>
                  <div className="flex gap-4">
                    {optionalColumns(trade.id).map((column) => (
                      <label key={column.key} className="flex min-h-touch items-center gap-2 text-sm">
                        <input type="checkbox" className="size-5 accent-primary" checked={!(hidden[trade.id] ?? []).includes(column.key)} onChange={() => toggle(trade.id, column.key)} />
                        {column.label}
                      </label>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
          <Alert variant="error">{action.error}</Alert>
          {saved && <Alert>Saved. New PDFs use these settings.</Alert>}
          <FormActions>
            <Button type="submit" size="lg" disabled={action.busy}>
              {action.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </Stack>
      </form>
    </>
  );
}
