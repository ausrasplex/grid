"use client";

// Pick a client, or add one on the spot (name is enough to start). Used when
// starting a job, in a job's details and on quotes. A client can be a person
// at a business (Sam Lee, Project Manager at Honeywell).
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Building2 } from "lucide-react";
import { emptyAddress, parseAddress, type Address } from "@grid/core";
import { AddressField, Alert, Button, Field, Label, PicturePicker, SearchInput, Sheet, SheetContent, api, useAction } from "@grid/ui";
import { LeadSourceField, type ReferrerJson } from "./LeadSourceField";

export interface BusinessJson {
  id: string;
  name: string;
  abn: string | null;
  email: string | null;
  phone: string | null;
  /** The one line: "12 Smith St, Brunswick VIC 3056". */
  address: string | null;
  addressParts: Address | null;
}

export interface BusinessRowJson extends BusinessJson {
  notes: string | null;
  peopleCount: number;
  /** Its logo, or null. */
  logoUrl: string | null;
}

export interface ClientJson {
  id: string;
  name: string;
  contactName: string | null;
  businessId: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  /** The one line: "12 Smith St, Brunswick VIC 3056". */
  address: string | null;
  addressParts: Address | null;
  abn: string | null;
  notes: string | null;
  business: BusinessJson | null;
  /** "Sam Lee, Honeywell", or just the name. */
  label: string;
  /** Their own photo, or null. */
  photoUrl: string | null;
  /** Their photo, else their business's logo, else null (initials). */
  pictureUrl: string | null;
  /** How they found you, or null. */
  leadSource: { id: string; name: string; isReferral: boolean } | null;
  /** Referral: the client who sent them. */
  referredBy: ReferrerJson | null;
}

/** "Project Manager, Honeywell". */
export const roleAt = (client: Pick<ClientJson, "role"> & { business?: { name: string } | null }) => [client.role, client.business?.name].filter(Boolean).join(", ") || null;

export function ClientPicker({
  value,
  onChange,
  canAdd = true,
  hint,
}: {
  value: (Pick<ClientJson, "id" | "name"> & Partial<ClientJson>) | null;
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

  const valueRole = value ? roleAt({ role: value.role ?? null, business: value.business }) : null;

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
              {(valueRole || value.email || value.phone) && <span className="block truncate text-sm text-muted-foreground">{[valueRole, value.email, value.phone].filter(Boolean).join(" · ")}</span>}
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
              onSaved={(client) => {
                onChange(client);
                setOpen(false);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <div className="flex flex-col gap-3 px-2">
              <SearchInput label="Search clients" placeholder="Name, business, email or address" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
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
                      <span className="truncate text-sm text-muted-foreground">{[roleAt(row), row.contactName, row.email, row.address].filter(Boolean).join(" · ") || "No details yet"}</span>
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
    role: initial.role ?? "",
    email: initial.email ?? "",
    phone: initial.phone ?? "",
    address: initial.addressParts ?? (initial.address ? parseAddress(initial.address) : emptyAddress),
    abn: initial.abn ?? "",
    notes: initial.notes ?? "",
  });
  const [business, setBusiness] = useState<BusinessJson | null>(initial.business ?? null);
  const [leadSource, setLeadSource] = useState(initial.leadSource ?? null);
  const [referredBy, setReferredBy] = useState(initial.referredBy ?? null);
  // Less-used fields fold away, open when they've got something in them.
  const [moreOpen, setMoreOpen] = useState(!!(initial.contactName || initial.notes || (!initial.business && initial.abn)));
  const action = useAction();
  const router = useRouter();
  const set = (field: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [field]: event.target.value });
  const nameField = <Field label="Name" hint={business ? undefined : "A person or a business"} value={form.name} onChange={set("name")} required autoFocus={!initial.id} />;
  return (
    <form
      className="flex flex-col gap-3 px-2"
      onSubmit={async (event) => {
        event.preventDefault();
        // The sheet renders in a portal, but React still bubbles submit to
        // a form the picker sits in (New quote). Keep it here.
        event.stopPropagation();
        // A person at a business: the business holds the ABN, and they're the contact themselves.
        const body = {
          ...form,
          businessId: business?.id ?? null,
          leadSourceId: leadSource?.id ?? null,
          referredByClientId: leadSource?.isReferral ? (referredBy?.id ?? null) : null,
          ...(business ? { contactName: "", abn: initial.abn ?? "" } : { role: "" }),
        };
        const client = await action.run(() =>
          initial.id ? api<ClientJson>(`/clients/${initial.id}`, { method: "PUT", body }) : api<ClientJson>("/clients", { body }),
        );
        if (client) onSaved(client);
      }}
    >
      {/* Their photo, centred at the top like Profile (once they're saved: a new client has nowhere to keep one yet). */}
      {initial.id && (
        <PicturePicker
          name={form.name || "Client"}
          url={initial.photoUrl ?? null}
          fallbackUrl={initial.pictureUrl && !initial.photoUrl ? initial.pictureUrl : null}
          path={`/pictures/client/${initial.id}`}
          onChange={() => router.refresh()}
          centred
        />
      )}
      {nameField}
      <BusinessField value={business} onChange={setBusiness} />
      {business && <Field label="Role" placeholder="e.g. Project Manager, Service Technician" value={form.role} onChange={set("role")} />}
      {/* With a business, an empty box uses the business's: shown greyed in the box. */}
      <Field label="Email" type="email" inputMode="email" autoComplete="off" value={form.email} onChange={set("email")} placeholder={business?.email ? `${business.email} (${business.name})` : undefined} />
      <Field label="Phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder={business?.phone ? `${business.phone} (${business.name})` : undefined} />
      <AddressField label="Address" value={form.address} onChange={(address) => setForm({ ...form, address })} placeholder={business?.address ? `Same as ${business.name}` : undefined} />
      <LeadSourceField
        value={leadSource}
        referrer={referredBy}
        clientId={initial.id}
        onChange={(source, referrer) => {
          setLeadSource(source);
          setReferredBy(referrer);
        }}
      />
      {moreOpen ? (
        <>
          {!business && <Field label="Contact person" value={form.contactName} onChange={set("contactName")} />}
          {!business && <Field label="ABN" value={form.abn} onChange={set("abn")} />}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Notes
            <textarea rows={3} value={form.notes} onChange={set("notes")} placeholder="e.g. Gate code 4512, dog in the yard" className="w-full rounded-md border border-input bg-card px-3 py-2 text-base font-normal" />
          </label>
        </>
      ) : (
        <Button type="button" variant="ghost" className="self-start px-0 text-primary hover:bg-transparent hover:underline" onClick={() => setMoreOpen(true)}>
          {business ? "Add notes" : "More details"}
        </Button>
      )}
      <Alert variant="error">{action.error}</Alert>
      {onDelete && (
        <Button type="button" variant="ghost" className="self-start px-0 text-destructive hover:bg-transparent hover:underline" onClick={onDelete}>
          Remove client
        </Button>
      )}
      <StickyActions>
        {onCancel && (
          <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={onCancel}>
            Back
          </Button>
        )}
        <Button type="submit" className="flex-1 sm:flex-none" disabled={action.busy}>
          {action.busy ? "Saving…" : "Save client"}
        </Button>
      </StickyActions>
    </form>
  );
}

/** Save (and Back) pinned to the bottom of the dialog, so there's no scrolling down to find it. */
function StickyActions({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-10 -mx-2 mt-1 flex gap-2 border-t bg-popover px-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:justify-end">{children}</div>;
}

/**
 * The business a client works for: pick one, add one by typing its name, or
 * none. Opens in place (the form is usually already in a sheet).
 */
function BusinessField({ value, onChange }: { value: BusinessJson | null; onChange: (business: BusinessJson | null) => void }) {
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<BusinessRowJson[]>([]);
  const action = useAction();
  useEffect(() => {
    if (!choosing) return;
    const timer = setTimeout(() => {
      api<BusinessRowJson[]>(`/clients/businesses?q=${encodeURIComponent(query)}`)
        .then(setRows)
        .catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [choosing, query]);
  const typed = query.trim();
  const exact = rows.some((row) => row.name.toLowerCase() === typed.toLowerCase());
  const pick = (business: BusinessJson | null) => {
    onChange(business);
    setChoosing(false);
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Business</span>
      {!choosing ? (
        <button type="button" onClick={() => setChoosing(true)} className="flex min-h-touch w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-left">
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
            {value ? <span className="truncate font-medium">{value.name}</span> : <span className="text-muted-foreground">None</span>}
          </span>
          <span className="text-sm font-semibold text-primary">{value ? "Change" : "Choose"}</span>
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border p-2">
          <SearchInput label="Search businesses" placeholder="e.g. Honeywell" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
          <ul className="flex flex-col divide-y">
            {rows.slice(0, 6).map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => pick(row)} className="flex min-h-touch w-full flex-col justify-center px-2 py-1.5 text-left hover:bg-muted">
                  <span className="font-medium">{row.name}</span>
                  <span className="text-sm text-muted-foreground">{row.peopleCount === 1 ? "1 person" : `${row.peopleCount} people`}</span>
                </button>
              </li>
            ))}
          </ul>
          {typed && !exact && (
            <Button type="button" variant="outline" disabled={action.busy} onClick={() => void action.run(async () => pick(await api<BusinessRowJson>("/clients/businesses", { body: { name: typed } })))}>
              + New business: {typed}
            </Button>
          )}
          <Alert variant="error">{action.error}</Alert>
          <div className="flex gap-2">
            {value && (
              <Button type="button" variant="ghost" onClick={() => pick(null)}>
                No business
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setChoosing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Add or edit a business. */
export function BusinessForm({ initial, onSaved, onDelete }: { initial: Partial<BusinessRowJson>; onSaved: (business: BusinessRowJson) => void; onDelete?: () => void }) {
  const [form, setForm] = useState({
    name: initial.name ?? "",
    abn: initial.abn ?? "",
    email: initial.email ?? "",
    phone: initial.phone ?? "",
    address: initial.addressParts ?? (initial.address ? parseAddress(initial.address) : emptyAddress),
    notes: initial.notes ?? "",
  });
  const action = useAction();
  const router = useRouter();
  const set = (field: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [field]: event.target.value });
  return (
    <form
      className="flex flex-col gap-3 px-2"
      onSubmit={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const business = await action.run(() =>
          initial.id ? api<BusinessRowJson>(`/clients/businesses/${initial.id}`, { method: "PUT", body: form }) : api<BusinessRowJson>("/clients/businesses", { body: form }),
        );
        if (business) onSaved(business);
      }}
    >
      {/* The logo, centred at the top like Profile (also shown for its people without a photo). */}
      {initial.id && (
        <PicturePicker name={form.name || "Business"} url={initial.logoUrl ?? null} path={`/pictures/business/${initial.id}`} onChange={() => router.refresh()} centred />
      )}
      <Field label="Business name" placeholder="e.g. Honeywell" value={form.name} onChange={set("name")} required autoFocus={!initial.id} />
      <Field label="ABN" value={form.abn} onChange={set("abn")} hint="Goes on quotes to anyone here" />
      <Field label="Main email" type="email" inputMode="email" autoComplete="off" value={form.email} onChange={set("email")} hint="Used when a person here has none of their own" />
      <Field label="Main phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} />
      <AddressField label="Office address" value={form.address} onChange={(address) => setForm({ ...form, address })} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Notes
        <textarea rows={3} value={form.notes} onChange={set("notes")} placeholder="e.g. Purchase order needed before work starts" className="w-full rounded-md border border-input bg-card px-3 py-2 text-base font-normal" />
      </label>
      <Alert variant="error">{action.error}</Alert>
      {onDelete && (
        <Button type="button" variant="ghost" className="self-start px-0 text-destructive hover:bg-transparent hover:underline" onClick={onDelete}>
          Remove business
        </Button>
      )}
      <StickyActions>
        <Button type="submit" className="flex-1 sm:flex-none" disabled={action.busy}>
          {action.busy ? "Saving…" : "Save business"}
        </Button>
      </StickyActions>
    </form>
  );
}
