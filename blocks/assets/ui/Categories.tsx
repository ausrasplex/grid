"use client";

// Settings › Asset categories (docs/assets-block.md §1): the kinds of gear
// the business has, each with its own fields ("Rated load (kg)" on
// ladders). While there are few, the trade's starting set is offered.
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { ActionButton, Alert, Button, Checkbox, EmptyState, Field, FormActions, List, PageHeader, SelectField, Section, Sheet, SheetContent, Stack, TapRow, api, useAction } from "@grid/ui";
import type { CategoryField, CategoryJson, FieldType } from "./shared";

interface Preset {
  name: string;
  fields: CategoryField[];
}

const TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "yesno", label: "Yes or no" },
];

/** A new field's key from its label (kept when the label changes later). */
const keyFor = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "field";

function CategorySheet({ category, onClose, onSaved }: { category: Partial<CategoryJson>; onClose: () => void; onSaved: (rows: CategoryJson[]) => void }) {
  const [name, setName] = useState(category.name ?? "");
  const [fields, setFields] = useState<(CategoryField & { fresh?: boolean })[]>(category.fields ?? []);
  const action = useAction();
  const change = (index: number, changes: Partial<CategoryField>) => setFields(fields.map((field, at) => (at === index ? { ...field, ...changes } : field)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...fields];
    const [field] = next.splice(index, 1);
    next.splice(index + by, 0, field!);
    setFields(next);
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title={category.id ? `Change ${category.name}` : "New category"} description="Its own fields show when adding an asset in it.">
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              const body = { name, fields: fields.filter((field) => field.label.trim()).map((field) => ({ key: field.fresh ? keyFor(field.label) : field.key, label: field.label.trim(), type: field.type })) };
              onSaved(await (category.id ? api<CategoryJson[]>(`/assets/categories/${category.id}`, { method: "PUT", body }) : api<CategoryJson[]>("/assets/categories", { body })));
            });
          }}
        >
          <Field label="Name" placeholder="e.g. Test equipment" value={name} onChange={(event) => setName(event.target.value)} required autoFocus={!category.id} />
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Fields</p>
            {fields.length === 0 && <p className="text-sm text-muted-foreground">None yet. Every asset has a name, number, make, model, serial number, date bought and notes already.</p>}
            {fields.map((field, index) => (
              <div key={`${field.key}-${index}`} className="flex flex-col gap-2 rounded-xl bg-muted/40 p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <Field label="Label" placeholder="e.g. Rated load (kg)" value={field.label} onChange={(event) => change(index, { label: event.target.value })} />
                  <SelectField label="Type" value={field.type} onChange={(event) => change(index, { type: event.target.value as FieldType })} options={TYPES} />
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={index === fields.length - 1} onClick={() => move(index, 1)} aria-label="Move down">
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => setFields(fields.filter((_, at) => at !== index))}>
                    <Trash2 /> Remove
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" className="self-start" onClick={() => setFields([...fields, { key: `new-${fields.length}`, label: "", type: "text", fresh: true }])}>
              <Plus /> Add a field
            </Button>
          </div>
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            {category.id && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-destructive"
                disabled={action.busy}
                onClick={() => {
                  const count = category.count ?? 0;
                  if (!window.confirm(`Remove ${category.name}?${count ? ` Its ${count} asset${count === 1 ? "" : "s"} stay, with no category.` : ""}`)) return;
                  void action.run(async () => onSaved(await api<CategoryJson[]>(`/assets/categories/${category.id}`, { method: "DELETE" })));
                }}
              >
                Remove
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={action.busy || !name.trim()}>
              {action.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Presets({ onAdded }: { onAdded: (rows: CategoryJson[]) => void }) {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const action = useAction();
  useEffect(() => {
    void api<Preset[]>("/assets/categories/presets")
      .then((rows) => (setPresets(rows), setTicked(new Set(rows.map((row) => row.name)))))
      .catch(() => setPresets([]));
  }, []);
  if (!presets?.length) return null;
  return (
    <Section title="A starting set for your trade" description="Tick the ones you want. You can rename them and add fields after.">
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1">
          {presets.map((preset) => (
            <li key={preset.name}>
              <label className="flex min-h-touch cursor-pointer items-center gap-3">
                <Checkbox
                  checked={ticked.has(preset.name)}
                  onCheckedChange={() => {
                    const next = new Set(ticked);
                    if (next.has(preset.name)) next.delete(preset.name);
                    else next.add(preset.name);
                    setTicked(next);
                  }}
                />
                <span>
                  {preset.name}
                  {preset.fields.length > 0 && <span className="text-sm text-muted-foreground"> · {preset.fields.map((field) => field.label).join(", ")}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Alert variant="error">{action.error}</Alert>
        <Button className="self-start" disabled={!ticked.size || action.busy} onClick={() => void action.run(async () => (onAdded(await api<CategoryJson[]>("/assets/categories/presets", { body: { names: [...ticked] } })), setPresets([])))}>
          <Plus /> Add {ticked.size} categor{ticked.size === 1 ? "y" : "ies"}
        </Button>
      </div>
    </Section>
  );
}

export function Categories({ initial }: { initial: CategoryJson[] }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState<Partial<CategoryJson> | null>(null);
  return (
    <>
      <PageHeader
        title="Asset categories"
        subtitle="The kinds of gear you have. Each can have its own fields, like the rated load on ladders."
        meta={`${rows.length} ${rows.length === 1 ? "category" : "categories"}`}
        actions={<ActionButton icon={<Plus />} label="Add category" onClick={() => setOpen({})} />}
      />
      <Stack>
        {rows.length < 3 && <Presets onAdded={setRows} />}
        <Section flush>
          {rows.length === 0 ? (
            <EmptyState title="No categories yet">Add your own, or start with the set above.</EmptyState>
          ) : (
            <List>
              {rows.map((row) => (
                <TapRow
                  key={row.id}
                  title={row.name}
                  meta={[`${row.count} asset${row.count === 1 ? "" : "s"}`, row.fields.length ? row.fields.map((field) => field.label).join(", ") : null].filter(Boolean).join(" · ")}
                  onClick={() => setOpen(row)}
                />
              ))}
            </List>
          )}
        </Section>
      </Stack>
      {open && (
        <CategorySheet
          category={open}
          onClose={() => setOpen(null)}
          onSaved={(next) => {
            setRows(next);
            setOpen(null);
          }}
        />
      )}
    </>
  );
}
