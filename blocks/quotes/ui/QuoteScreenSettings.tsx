"use client";

// Settings › You › Quote screen: what swiping a line does on a draft quote,
// for you only (each person sets their own, in each business).

import { useState } from "react";
import { Alert, Button, FormActions, PageHeader, Section, SelectField, Stack, api, useAction } from "@grid/ui";
import { SWIPE_ACTIONS, SWIPE_ACTION_NAMES, type SwipeAction } from "../swipe";

export interface QuoteScreenSettingsJson {
  swipeLeft: SwipeAction;
  swipeRight: SwipeAction;
}

export function QuoteScreenSettings({ initial }: { initial: QuoteScreenSettingsJson }) {
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const options = SWIPE_ACTIONS.map((value) => ({ value, label: SWIPE_ACTION_NAMES[value] }));
  return (
    <>
      <PageHeader title="Quote screen" subtitle="Your own settings. Everyone else in the business sets theirs." />
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSaved(false);
          const result = await action.run(() => api<QuoteScreenSettingsJson>("/quotes/me/settings", { method: "PUT", body: form }));
          if (result) (setForm(result), setSaved(true));
        }}
      >
        <Stack>
          <Section title="Swiping a line" description="On a draft quote, swipe a line left or right past a third of the way to do this. Tapping a line still opens it.">
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Swipe left" value={form.swipeLeft} onChange={(event) => setForm({ ...form, swipeLeft: event.target.value as SwipeAction })} options={options} />
              <SelectField label="Swipe right" value={form.swipeRight} onChange={(event) => setForm({ ...form, swipeRight: event.target.value as SwipeAction })} options={options} />
            </div>
          </Section>
          <Alert variant="error">{action.error}</Alert>
          <Alert variant="success">{saved && "Saved."}</Alert>
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
