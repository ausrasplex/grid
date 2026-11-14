"use client";

// My tickets & licences: your own, with card photos and expiry dates.
// Expired and expiring ones come first. Tap one for its photos and details.

import { useRef, useState } from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import { ActionButton, Alert, Badge, Button, EmptyState, Field, FormActions, PageHeader, Section, SelectField, Sheet, SheetContent, Stack, api, cn, useAction } from "@grid/ui";
import { TICKET_TYPES, expiryWords, type TicketStatus } from "../types";

export interface TicketJson {
  id: string;
  type: string;
  title: string;
  name: string;
  number: string | null;
  issuer: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  frontFileId: string | null;
  backFileId: string | null;
  notes: string | null;
  status: TicketStatus;
  daysLeft: number | null;
}

const BADGE: Record<TicketStatus, { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
  current: { label: "Current", variant: "success" },
  soon: { label: "Expiring soon", variant: "warning" },
  expired: { label: "Expired", variant: "destructive" },
  "no-expiry": { label: "No expiry", variant: "outline" },
};

const longDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : null);
const photoUrl = (fileId: string, variant: "thumb" | "display" | "original" = "display") => `/api/files/${fileId}?v=${variant}`;

/** Sends a photo to /api/files; returns its id. */
async function uploadPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/files", { method: "POST", body: form, credentials: "same-origin" });
  const body = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok || !body?.id) throw new Error(body?.error?.message ?? "Couldn't upload the photo");
  return body.id;
}

export function Tickets({ initial }: { initial: TicketJson[] }) {
  const [tickets, setTickets] = useState(initial);
  const [open, setOpen] = useState<TicketJson | null>(null);
  const [editing, setEditing] = useState<TicketJson | "new" | null>(null);
  const expired = tickets.filter((ticket) => ticket.status === "expired").length;
  const soon = tickets.filter((ticket) => ticket.status === "soon").length;

  return (
    <>
      <PageHeader
        title="My tickets & licences"
        meta={tickets.length ? [`${tickets.length} saved`, expired ? `${expired} expired` : null, soon ? `${soon} expiring soon` : null].filter(Boolean).join(" · ") : undefined}
        subtitle="Yours, not the business's: only you can see them. Grid emails you before one runs out."
        actions={<ActionButton icon={<Plus />} label="Add" onClick={() => setEditing("new")} />}
      />
      <Stack>
        {tickets.length === 0 ? (
          <Section>
            <EmptyState title="No tickets yet">Add your White Card, licence, EWP and the rest, with a photo of each card, so they&apos;re always on your phone.</EmptyState>
          </Section>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <button type="button" onClick={() => setOpen(ticket)} className="flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left hover:bg-muted sm:p-4">
                  <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                    {ticket.frontFileId ? (
                      <img src={photoUrl(ticket.frontFileId, "thumb")} alt="" className="size-full object-cover" />
                    ) : (
                      <Camera className="size-6 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{ticket.title}</span>
                    {ticket.name && ticket.type !== "other" && <span className="block truncate text-sm">{ticket.name}</span>}
                    <span className={cn("block text-sm", ticket.status === "expired" ? "text-destructive" : "text-muted-foreground")}>{expiryWords(ticket.daysLeft)}</span>
                  </span>
                  <Badge variant={BADGE[ticket.status].variant}>{BADGE[ticket.status].label}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Stack>

      {open && (
        <TicketSheet
          ticket={open}
          onClose={() => setOpen(null)}
          onEdit={() => (setEditing(open), setOpen(null))}
          onDeleted={(next) => (setTickets(next), setOpen(null))}
        />
      )}
      {editing && (
        <TicketForm
          ticket={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => (setTickets(next), setEditing(null))}
        />
      )}
    </>
  );
}

/** One ticket: its photos large, and its details. */
function TicketSheet({ ticket, onClose, onEdit, onDeleted }: { ticket: TicketJson; onClose: () => void; onEdit: () => void; onDeleted: (tickets: TicketJson[]) => void }) {
  const action = useAction();
  const rows: [string, string | null][] = [
    ["Number", ticket.number],
    ["Issued by", ticket.issuer],
    ["Issued", longDate(ticket.issuedOn)],
    ["Expires", ticket.expiresOn ? `${longDate(ticket.expiresOn)} (${expiryWords(ticket.daysLeft).toLowerCase()})` : "Doesn't expire"],
    ["Notes", ticket.notes],
  ];
  return (
    <Sheet open onOpenChange={(value) => !value && onClose()}>
      <SheetContent title={ticket.title} description={ticket.type !== "other" && ticket.name ? ticket.name : undefined}>
        <div className="flex flex-col gap-4 px-2">
          <Badge variant={BADGE[ticket.status].variant} className="self-start">
            {BADGE[ticket.status].label}
          </Badge>
          {(ticket.frontFileId || ticket.backFileId) && (
            <div className="grid grid-cols-2 gap-2">
              {[ticket.frontFileId, ticket.backFileId].map((fileId, index) =>
                fileId ? (
                  <a key={fileId} href={photoUrl(fileId, "original")} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg bg-muted">
                    <img src={photoUrl(fileId)} alt={index === 0 ? "Front of the card" : "Back of the card"} className="aspect-[1.6] w-full object-cover" />
                  </a>
                ) : null,
              )}
            </div>
          )}
          <dl className="divide-y rounded-lg bg-muted/40">
            {rows
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="flex gap-3 px-3 py-2.5">
                  <dt className="w-24 shrink-0 text-sm text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 flex-1 break-words whitespace-pre-wrap">{value}</dd>
                </div>
              ))}
          </dl>
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button
              variant="ghost"
              className="text-destructive sm:mr-auto"
              disabled={action.busy}
              onClick={async () => {
                if (!window.confirm(`Delete ${ticket.title} and its photos?`)) return;
                const next = await action.run(() => api<TicketJson[]>(`/credentials/${ticket.id}`, { method: "DELETE" }));
                if (next) onDeleted(next);
              }}
            >
              <Trash2 /> Delete
            </Button>
            <Button size="lg" onClick={onEdit}>
              Change or renew
            </Button>
          </FormActions>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Add or change a ticket (renewing = a new expiry date and photo). */
function TicketForm({ ticket, onClose, onSaved }: { ticket: TicketJson | null; onClose: () => void; onSaved: (tickets: TicketJson[]) => void }) {
  const [type, setType] = useState(ticket?.type ?? "white-card");
  const [name, setName] = useState(ticket?.name ?? "");
  const [number, setNumber] = useState(ticket?.number ?? "");
  const [issuer, setIssuer] = useState(ticket?.issuer ?? "");
  const [issuedOn, setIssuedOn] = useState(ticket?.issuedOn ?? "");
  const [noExpiry, setNoExpiry] = useState(ticket ? !ticket.expiresOn : false);
  const [expiresOn, setExpiresOn] = useState(ticket?.expiresOn ?? "");
  const [notes, setNotes] = useState(ticket?.notes ?? "");
  const [front, setFront] = useState<string | null>(ticket?.frontFileId ?? null);
  const [back, setBack] = useState<string | null>(ticket?.backFileId ?? null);
  const [uploading, setUploading] = useState<"front" | "back" | null>(null);
  const action = useAction();
  const hint = TICKET_TYPES.find((candidate) => candidate.id === type)?.issuerHint;

  return (
    <Sheet open onOpenChange={(value) => !value && onClose()}>
      <SheetContent title={ticket ? `Change ${ticket.title}` : "Add a ticket or licence"}>
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const body = {
              type,
              name: name.trim(),
              number: number.trim() || null,
              issuer: issuer.trim() || null,
              issuedOn: issuedOn || null,
              expiresOn: noExpiry ? null : expiresOn || null,
              frontFileId: front,
              backFileId: back,
              notes: notes.trim() || null,
            };
            const next = await action.run(() => (ticket ? api<TicketJson[]>(`/credentials/${ticket.id}`, { method: "PUT", body }) : api<TicketJson[]>("/credentials", { body })));
            if (next) onSaved(next);
          }}
        >
          <SelectField label="What is it?" value={type} onChange={(event) => setType(event.target.value)} options={TICKET_TYPES.map((option) => ({ value: option.id, label: option.name }))} />
          <Field
            label={type === "other" ? "Name" : "Class or details (optional)"}
            placeholder={type === "other" ? "e.g. Forklift licence" : type === "electrical-licence" ? "e.g. A-grade" : undefined}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required={type === "other"}
          />
          <div className="grid grid-cols-2 gap-3">
            <PhotoButton label="Front of card" fileId={front} busy={uploading === "front"} onUploading={(busy) => setUploading(busy ? "front" : null)} onChange={setFront} onError={action.setError} />
            <PhotoButton label="Back of card" fileId={back} busy={uploading === "back"} onUploading={(busy) => setUploading(busy ? "back" : null)} onChange={setBack} onError={action.setError} />
          </div>
          <Field label="Number" autoComplete="off" value={number} onChange={(event) => setNumber(event.target.value)} hint="Stored encrypted." />
          <Field label="Issued by" placeholder={hint} value={issuer} onChange={(event) => setIssuer(event.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issued" type="date" value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} />
            <Field label="Expires" type="date" value={noExpiry ? "" : expiresOn} disabled={noExpiry} onChange={(event) => setExpiresOn(event.target.value)} required={!noExpiry} />
          </div>
          <label className="flex min-h-touch items-center gap-3">
            <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={noExpiry} onChange={(event) => setNoExpiry(event.target.checked)} />
            It doesn&apos;t expire
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium lg:max-w-2xl">
            Notes
            <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-base font-normal" />
          </label>
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" size="lg" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={action.busy || !!uploading}>
              {action.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** A photo of one side of the card: take one (or pick one) on the phone. */
function PhotoButton({
  label,
  fileId,
  busy,
  onUploading,
  onChange,
  onError,
}: {
  label: string;
  fileId: string | null;
  busy: boolean;
  onUploading: (busy: boolean) => void;
  onChange: (fileId: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={picker}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          onUploading(true);
          onError(null);
          try {
            onChange(await uploadPhoto(file));
          } catch (failure) {
            onError((failure as Error).message);
          } finally {
            onUploading(false);
          }
        }}
      />
      <button
        type="button"
        onClick={() => picker.current?.click()}
        className="flex aspect-[1.6] w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-input bg-muted/40 hover:bg-muted"
        aria-label={fileId ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
      >
        {busy ? (
          <span className="text-sm text-muted-foreground">Uploading…</span>
        ) : fileId ? (
          <img src={photoUrl(fileId, "thumb")} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
            <Camera className="size-6" />
            {label}
          </span>
        )}
      </button>
      {fileId && !busy && (
        <button type="button" className="self-start text-xs text-muted-foreground underline" onClick={() => onChange(null)}>
          Remove photo
        </button>
      )}
    </div>
  );
}
