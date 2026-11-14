"use client";

// Pick a client, or add one on the spot (name is enough to start). Used when
// starting a job, in a job's details and on quotes.
import { useEffect, useState } from "react";
import { AddressField, Alert, Button, Field, FormActions, Label, SearchInput, Sheet, SheetContent, api, useAction } from "@grid/ui";

export interface ClientJson {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  abn: string | null;
  notes: string | null;
}

export function ClientPicker({
  value,
  onChange,
  canAdd = true,
  hint,
}: {
  value: Pick<ClientJson, "id" | "name"> & Partial<ClientJson> | null;
  onChange: (client: ClientJson | null) => void;
  /** Has clients.add: offer "+ New client". */
  canAdd?: boolean;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ClientJson[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      api<ClientJson[]>(`/clients?q=${encodeURIComponent(query)}`)
        .then(setRows)
        .catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [open, query]);

  return (
    <div className="flex flex-col gap-2 lg:max-w-2xl">
      <Label>Client</Label>
      {hint && <p className="-mt-1 text-sm text-muted-foreground">{hint}</p>}
      <Sheet open={open} onOpenChange={(open) => (setOpen(open), setAdding(false))}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-touch w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-left"
        >
          {value ? (
            <span className="min-w-0">
              <span className="block truncate font-medium">{value.name}</span>
              {(value.email || value.phone) && <span className="block truncate text-sm text-muted-foreground">{[value.email, value.phone].filter(Boolean).join(" · ")}</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">Choose or add a client</span>
          )}
          <span className="text-sm font-semibold text-primary">{value ? "Change" : "Choose"}</span>
        </button>
        <SheetContent title={adding ? "New client" : "Client"}>
          {adding ? (
            <ClientForm
              initial={{ name: query }}
              onSaved={(event) => {
                onChange(event);
                setOpen(false);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <div className="flex flex-col gap-3 px-2">
              <SearchInput label="Search clients" placeholder="Name, email or address" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
              {canAdd && (
                <Button variant="outline" onClick={() => setAdding(true)}>
                  + New client{query ? `: ${query}` : ""}
                </Button>
              )}
              <ul className="divide-y rounded-lg border">
                {rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="flex min-h-touch-lg w-full flex-col justify-center px-3 py-2 text-left hover:bg-muted"
                      onClick={() => {
                        onChange(row);
                        setOpen(false);
                      }}
                    >
                      <span className="font-medium">{row.name}</span>
                      <span className="truncate text-sm text-muted-foreground">{[row.contactName, row.email, row.address].filter(Boolean).join(" · ") || "No details yet"}</span>
                    </button>
                  </li>
                ))}
                {rows.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">{query ? "No clients match." : "No clients yet."}</li>}
              </ul>
              {value && (
                <Button variant="ghost" onClick={() => (onChange(null), setOpen(false))}>
                  No client
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Add or edit a client. */
export function ClientForm({
  initial,
  onSaved,
  onCancel,
  onDelete,
}: {
  initial: Partial<ClientJson>;
  onSaved: (client: ClientJson) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState({
    name: initial.name ?? "",
    contactName: initial.contactName ?? "",
    email: initial.email ?? "",
    phone: initial.phone ?? "",
    address: initial.address ?? "",
    abn: initial.abn ?? "",
    notes: initial.notes ?? "",
  });
  const action = useAction();
  const set = (field: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [field]: event.target.value });
  return (
    <form
      className="flex flex-col gap-3 px-2"
      onSubmit={async (event) => {
        event.preventDefault();
        // The sheet renders in a portal, but React still bubbles submit to
        // a form the picker sits in (New quote). Keep it here.
        event.stopPropagation();
        const client = await action.run(() =>
          initial.id ? api<ClientJson>(`/clients/${initial.id}`, { method: "PUT", body: form }) : api<ClientJson>("/clients", { body: form }),
        );
        if (client) onSaved(client);
      }}
    >
      <Field label="Name" hint="A person or a business" value={form.name} onChange={set("name")} required autoFocus />
      <Field label="Contact person" value={form.contactName} onChange={set("contactName")} />
      <Field label="Email" type="email" inputMode="email" autoComplete="off" value={form.email} onChange={set("email")} />
      <Field label="Phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} />
      <AddressField label="Address" value={form.address} onChange={set("address")} />
      <Field label="ABN" hint="For business clients" value={form.abn} onChange={set("abn")} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Notes
        <textarea rows={3} value={form.notes} onChange={set("notes")} placeholder="e.g. Gate code 4512, dog in the yard" className="w-full rounded-md border border-input bg-card px-3 py-2 text-base font-normal" />
      </label>
      <Alert variant="error">{action.error}</Alert>
      <FormActions>
        {onDelete && (
          <Button type="button" variant="ghost" className="text-destructive" onClick={onDelete}>
            Remove client
          </Button>
        )}
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Back
          </Button>
        )}
        <Button type="submit" disabled={action.busy}>
          {action.busy ? "Saving…" : "Save client"}
        </Button>
      </FormActions>
    </form>
  );
}
