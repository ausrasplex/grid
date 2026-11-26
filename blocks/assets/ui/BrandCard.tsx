"use client";

// The maker's card on an asset's page (Docket's brand card): its support
// site, website, phone and email, set once on the brand (in Materials) and
// shown on every asset of that make.
import { useState } from "react";
import { Globe, LifeBuoy, Mail, Pencil, Phone } from "lucide-react";
import { Alert, Button, Field, Section, Sheet, SheetContent, api, useAction } from "@grid/ui";
import { TextArea } from "./shared";

export interface BrandJson {
  id: string;
  name: string;
  website: string | null;
  supportUrl: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  notes: string | null;
}

/** "makita.com.au/support". */
export const host = (link: string) => {
  try {
    const url = new URL(link);
    return (url.hostname + url.pathname).replace(/^www\./, "").replace(/\/$/, "");
  } catch {
    return link;
  }
};

export function BrandCard({ brand, canEdit }: { brand: BrandJson; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const rows = [
    brand.supportUrl && { icon: LifeBuoy, text: host(brand.supportUrl), href: brand.supportUrl, label: "Support" },
    brand.website && { icon: Globe, text: host(brand.website), href: brand.website, label: "Website" },
    brand.supportPhone && { icon: Phone, text: brand.supportPhone, href: `tel:${brand.supportPhone.replace(/\s/g, "")}`, label: "Phone" },
    brand.supportEmail && { icon: Mail, text: brand.supportEmail, href: `mailto:${brand.supportEmail}`, label: "Email" },
  ].filter(Boolean) as { icon: typeof Globe; text: string; href: string; label: string }[];

  return (
    <Section
      title={brand.name}
      description={`Shared by every ${brand.name} asset.`}
      actions={
        canEdit && (
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Pencil /> Edit
          </Button>
        )
      }
    >
      <div className="flex flex-col">
        {rows.length ? (
          rows.map((row) => (
            <a
              key={row.label}
              href={row.href}
              target={row.href.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="group flex min-h-touch-lg items-center gap-3 border-t py-2.5 first:border-t-0"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                <row.icon className="size-[18px]" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-xs font-semibold text-muted-foreground">{row.label}</span>
                <span className="truncate text-sm font-semibold group-hover:underline">{row.text}</span>
              </span>
            </a>
          ))
        ) : (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">No support details yet.{canEdit ? " Add the support site and phone number once, and every asset of this brand gets them." : ""}</p>
        )}
        {brand.notes && <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{brand.notes}</p>}
      </div>
      {open && <BrandSheet brand={brand} onClose={() => setOpen(false)} />}
    </Section>
  );
}

function BrandSheet({ brand, onClose }: { brand: BrandJson; onClose: () => void }) {
  const [form, setForm] = useState({ supportUrl: brand.supportUrl ?? "", website: brand.website ?? "", supportPhone: brand.supportPhone ?? "", supportEmail: brand.supportEmail ?? "", notes: brand.notes ?? "" });
  const action = useAction();
  const set = (changes: Partial<typeof form>) => setForm((current) => ({ ...current, ...changes }));
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        title={`Edit ${brand.name}`}
        description="Used on every asset of this brand."
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={action.busy} onClick={() => void action.run(async () => (await api(`/materials/brands/${brand.id}/support`, { method: "PUT", body: form }), window.location.reload()))}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 px-2">
          <Field label="Support site" inputMode="url" placeholder="makita.com.au/support" hint="Their support, manuals or warranty-claim page." value={form.supportUrl} onChange={(event) => set({ supportUrl: event.target.value })} autoFocus />
          <Field label="Website" inputMode="url" placeholder="makita.com.au" value={form.website} onChange={(event) => set({ website: event.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Support phone" inputMode="tel" placeholder="1300 …" value={form.supportPhone} onChange={(event) => set({ supportPhone: event.target.value })} />
            <Field label="Support email" inputMode="email" value={form.supportEmail} onChange={(event) => set({ supportEmail: event.target.value })} />
          </div>
          <TextArea id="brand-notes" label="Notes (optional)" value={form.notes} onChange={(notes) => set({ notes })} placeholder="Account number, warranty registration…" />
          <Alert variant="error">{action.error}</Alert>
        </div>
      </SheetContent>
    </Sheet>
  );
}
