"use client";

// Settings › Custom icons (phase 4c part 3): the business's own icons for
// plans, built like the built-in ones (an outline and up to 3 letters, in a
// trade's colour), so they read the same and stay sharp at any zoom.
// Deleting takes an icon out of the library; ones already placed stay.

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionButton, Alert, Button, EmptyState, Field, FormActions, List, PageHeader, Section, Segmented, SelectField, Sheet, SheetContent, Stack, api, useAction } from "@grid/ui";
import { CUSTOM_TRADE, ICON_OUTLINES, OUTLINE_NAMES, TRADES, customIcon, type CustomIconRow, type IconOutline } from "../icons";
import { IconGlyph } from "./IconGlyph";

const tradeOptions = [{ value: CUSTOM_TRADE.id, label: "Custom (its own group)" }, ...TRADES.map((trade) => ({ value: trade.id, label: trade.name }))];
const colourOf = (tradeId: string) => TRADES.find((trade) => trade.id === tradeId)?.colour ?? CUSTOM_TRADE.colour;

export function CustomIcons({ initial, canManage }: { initial: CustomIconRow[]; canManage: boolean }) {
  const [icons, setIcons] = useState(initial.filter((icon) => !icon.deleted));
  const [editing, setEditing] = useState<CustomIconRow | "new" | null>(null);
  const action = useAction();
  return (
    <>
      <PageHeader
        title="Custom icons"
        subtitle="Your own symbols for plans, beside the built-in ones. They're counted and priced in take-offs like any other icon."
        actions={canManage && <ActionButton icon={<Plus />} label="New icon" onClick={() => setEditing("new")} />}
      />
      <Stack>
        <Section flush>
          {icons.length === 0 ? (
            <EmptyState title="No custom icons yet">{canManage ? "Make one for anything the built-in library doesn't have, like a bollard light or a client's own fitting." : "Your Owner or Foreman can add them."}</EmptyState>
          ) : (
            <List>
              {icons.map((row) => (
                <li key={row.id}>
                  <button type="button" disabled={!canManage} onClick={() => setEditing(row)} className="flex min-h-touch-lg w-full items-center gap-3 px-4 py-2 text-left enabled:hover:bg-muted sm:px-6">
                    <span className="paper flex size-10 shrink-0 items-center justify-center rounded bg-white">
                      <IconGlyph icon={customIcon(row)} colour={colourOf(row.trade)} className="size-8" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{row.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">{[tradeOptions.find((option) => option.value === row.trade)?.label.replace(" (its own group)", ""), row.words.join(", ")].filter(Boolean).join(" · ")}</span>
                    </span>
                  </button>
                </li>
              ))}
            </List>
          )}
        </Section>
        <Alert variant="error">{action.error}</Alert>
      </Stack>
      {editing && (
        <IconForm
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setIcons((current) => (current.some((icon) => icon.id === saved.id) ? current.map((icon) => (icon.id === saved.id ? saved : icon)) : [...current, saved]));
            setEditing(null);
          }}
          onDeleted={(id) => {
            setIcons((current) => current.filter((icon) => icon.id !== id));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function IconForm({ initial, onClose, onSaved, onDeleted }: { initial: CustomIconRow | null; onClose: () => void; onSaved: (icon: CustomIconRow) => void; onDeleted: (id: string) => void }) {
  const [form, setForm] = useState({ name: initial?.name ?? "", trade: initial?.trade ?? CUSTOM_TRADE.id, outline: (initial?.outline as IconOutline) ?? "circle", label: initial?.label ?? "", words: initial?.words.join(", ") ?? "" });
  const action = useAction();
  const preview = customIcon({ id: "00000000-0000-0000-0000-000000000000", trade: form.trade, name: form.name, words: [], outline: form.outline, label: form.label.slice(0, 3), deleted: false });
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title={initial ? "Change icon" : "New icon"} description="Pick a shape and up to 3 letters or numbers. It takes its trade's colour on the plan." desktop="dialog">
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              const body = { name: form.name, trade: form.trade, outline: form.outline, label: form.label, words: form.words.split(",").map((word) => word.trim()).filter(Boolean) };
              onSaved(await api<CustomIconRow>(initial ? `/markups/custom-icons/${initial.id}` : "/markups/custom-icons", { method: initial ? "PUT" : "POST", body }));
            });
          }}
        >
          <div className="flex items-center gap-4">
            <span className="paper flex size-16 shrink-0 items-center justify-center rounded-lg bg-white">
              <IconGlyph icon={preview} colour={colourOf(form.trade)} className="size-14" />
            </span>
            <Field label="Name" placeholder="e.g. Bollard light" value={form.name} maxLength={60} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </div>
          <Field label="Letters (up to 3)" placeholder="e.g. BL" value={form.label} maxLength={3} onChange={(event) => setForm({ ...form, label: event.target.value.toUpperCase() })} required />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Shape</span>
            <Segmented label="Shape" value={form.outline} onChange={(outline) => setForm({ ...form, outline })} items={ICON_OUTLINES.map((outline) => ({ value: outline, label: OUTLINE_NAMES[outline] }))} />
          </div>
          <SelectField label="Trade" value={form.trade} onChange={(event) => setForm({ ...form, trade: event.target.value })} options={tradeOptions} hint="It shows in that trade's group in the library, in its colour." />
          <Field label="Other words for it (optional)" placeholder="e.g. garden, path light" value={form.words} onChange={(event) => setForm({ ...form, words: event.target.value })} hint="Separate with commas. The library search finds them." />
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            {initial && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    if (!window.confirm(`Take ${initial.name} out of the library? Ones already placed on plans stay.`)) return;
                    await api(`/markups/custom-icons/${initial.id}`, { method: "DELETE" });
                    onDeleted(initial.id);
                  })
                }
              >
                <Trash2 /> Delete
              </Button>
            )}
            <Button type="submit" disabled={action.busy}>
              {action.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}
