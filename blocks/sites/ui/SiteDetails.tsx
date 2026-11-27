"use client";

// Name & address on a site's page: fix an address (a wrong suburb, one split
// badly from an old one-line address) or rename the site. Only the company
// that looks after the site, with "Edit buildings and levels".
// (docs/stage-2-projects.md "Addresses")

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addressOf, formatAddress, isEmptyAddress, type Address } from "@grid/core";
import { AddressField, Alert, Button, Field, FormActions, Icon, List, Section, Sheet, SheetContent, TapRow, api, useAction } from "@grid/ui";
import { siteNameFromAddress } from "../address";

export interface SiteDetailsJson {
  id: string;
  name: string;
  address: string;
  addressParts: Address;
}

export function SiteDetails({ site }: { site: SiteDetailsJson }) {
  const [open, setOpen] = useState(false);
  const parts = addressOf(site);
  // Something's missing: say so on the row, so it gets fixed before reports count it.
  const missing = [!parts.suburb && "suburb", !parts.state && "state", !parts.postcode && "postcode"].filter(Boolean) as string[];
  return (
    <Section flush>
      <List>
        <TapRow
          leading={
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground [&_svg]:size-5">
              <Icon name="pin" />
            </span>
          }
          title="Name & address"
          meta={missing.length ? `Needs ${missing.join(", ")}` : site.address}
          onClick={() => setOpen(true)}
        />
      </List>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Name & address" desktop="dialog">
          {open && <SiteDetailsForm site={site} onDone={() => setOpen(false)} />}
        </SheetContent>
      </Sheet>
    </Section>
  );
}

function SiteDetailsForm({ site, onDone }: { site: SiteDetailsJson; onDone: () => void }) {
  const router = useRouter();
  const action = useAction();
  const [address, setAddress] = useState(() => addressOf(site));
  // A house named after its address follows it, until a name is typed.
  const autoName = site.name === siteNameFromAddress(site.address);
  const [name, setName] = useState(site.name);
  const [nameTyped, setNameTyped] = useState(!autoName);
  const shownName = nameTyped ? name : isEmptyAddress(address) ? site.name : siteNameFromAddress(formatAddress(address));
  return (
    <form
      className="flex flex-col gap-4 px-4 pb-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const body = { address, ...(nameTyped ? { name: name.trim() || site.name } : {}) };
        const saved = await action.run(() => api(`/sites/${site.id}`, { method: "PATCH", body }));
        if (saved) {
          onDone();
          router.refresh();
        }
      }}
    >
      <AddressField label="Address" value={address} onChange={setAddress} required hint="Check the suburb, state and postcode: reports count jobs by them." />
      <Field
        label="Site name"
        value={shownName}
        onChange={(event) => (setName(event.target.value), setNameTyped(true))}
        hint={nameTyped ? undefined : "Follows the address. Type a name to keep your own."}
        required
      />
      <Alert variant="error">{action.error}</Alert>
      <FormActions>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={action.busy || isEmptyAddress(address)}>
          {action.busy ? "Saving…" : "Save"}
        </Button>
      </FormActions>
    </form>
  );
}
