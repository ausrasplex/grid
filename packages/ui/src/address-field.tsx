"use client";

// An address box that suggests as you type:
//   - Your sites (with `sites`): sites your business already has, matched by
//     name, address or client. Picking one hands the site to the form
//     (`onSite`), which can then use it (e.g. New job switches to it).
//   - Addresses: real ones from Google Maps, when the server admin has turned
//     it on in Settings › Maps. Picking one fills in the whole address.
// The two are shown as separate groups. With neither, or offline, it's a
// plain text box: typing an address always works.
//
// Same shape as Field (label, hint, value, onChange with event.target.value),
// so it drops in wherever an address is typed.

import { useEffect, useId, useRef, useState } from "react";
import { Building2, Home, MapPin } from "lucide-react";
import { api } from "./api";
import { Input } from "./components/input";
import { Label } from "./components/label";
import { cn } from "./lib/utils";

interface Suggestion {
  placeId: string;
  text: string;
  main: string;
  secondary: string;
}

/** One of your business's sites, as suggested in an address box. */
export interface SiteMatch {
  id: string;
  name: string;
  address: string;
  kind: "MANAGED" | "PRIVATE";
  /** Archived: its last job finished (it comes back when a new job starts there). */
  archived: boolean;
}

export interface AddressPick {
  address: string;
  location: { lat: number; lng: number } | null;
}

type Row = { kind: "site"; site: SiteMatch } | { kind: "address"; suggestion: Suggestion };

/** Once the server says address suggestions are off (or sites can't be listed), stop asking until the page reloads. */
let addressesOff = false;
let sitesOff = false;

const newSession = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
/** "12 Smith St, Brunswick" → words the Sites search can match. */
const siteQuery = (text: string) => text.replace(/[,]/g, " ").replace(/\s+/g, " ").trim();

interface SiteRow {
  id: string;
  name: string;
  address: string;
  kind: "MANAGED" | "PRIVATE";
  archivedAt: string | null;
}

async function findSites(query: string): Promise<SiteMatch[]> {
  const q = encodeURIComponent(siteQuery(query));
  const [active, archived] = await Promise.all([
    api<SiteRow[]>(`/sites?tab=active&q=${q}`),
    api<SiteRow[]>(`/sites?tab=archived&q=${q}`).catch(() => [] as SiteRow[]),
  ]);
  return [...active, ...archived].slice(0, 5).map((row) => ({ id: row.id, name: row.name, address: row.address, kind: row.kind, archived: !!row.archivedAt }));
}

export function AddressField({
  label,
  hint,
  error,
  value,
  onChange,
  onPick,
  sites = false,
  onSite,
  id,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  label: string;
  hint?: string;
  error?: string | null;
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  /** After a Google address is picked: the full address and where it is. */
  onPick?: (pick: AddressPick) => void;
  /** Also suggest your business's sites (needs permission to see sites). */
  sites?: boolean;
  /** A site was picked (its address is filled in first). */
  onSite?: (site: SiteMatch) => void;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const helpId = `${inputId}-help`;
  const listId = `${inputId}-suggestions`;
  const [siteRows, setSiteRows] = useState<SiteMatch[]>([]);
  const [addressRows, setAddressRows] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [addressesOn, setAddressesOn] = useState(!addressesOff);
  const [sitesOn, setSitesOn] = useState(sites && !sitesOff);
  const session = useRef(newSession());
  /** The text just picked (don't search it again). */
  const picked = useRef<string | null>(null);
  /** Only search after the person types, not for a value filled in from elsewhere. */
  const typed = useRef(false);
  const suggesting = addressesOn || sitesOn;

  useEffect(() => {
    const query = value.trim();
    if (!suggesting || !typed.current || query.length < 3 || query === picked.current) {
      setSiteRows([]);
      setAddressRows([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      // Sites and addresses load separately: whichever answers first shows first.
      if (sitesOn && !sitesOff) {
        findSites(query)
          .then((found) => {
            if (!alive) return;
            setSiteRows(found);
            if (found.length) setOpen(true);
          })
          .catch(() => {
            // No permission to see sites (or offline): just addresses.
            sitesOff = true;
            if (alive) setSitesOn(false);
          });
      }
      if (addressesOn && !addressesOff) {
        api<{ enabled: boolean; suggestions: Suggestion[] }>(`/places/autocomplete?q=${encodeURIComponent(query)}&session=${session.current}`)
          .then((result) => {
            if (!alive) return;
            if (!result.enabled) {
              addressesOff = true;
              setAddressesOn(false);
              return;
            }
            setAddressRows(result.suggestions);
            if (result.suggestions.length) setOpen(true);
          })
          .catch(() => alive && setAddressRows([]));
      }
      setActive(-1);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [value, suggesting, sitesOn, addressesOn]);

  const close = () => {
    setOpen(false);
    setSiteRows([]);
    setAddressRows([]);
  };

  const chooseSite = (site: SiteMatch) => {
    close();
    picked.current = site.address;
    onChange({ target: { value: site.address } });
    onSite?.(site);
  };

  const chooseAddress = async (suggestion: Suggestion) => {
    close();
    picked.current = suggestion.text;
    onChange({ target: { value: suggestion.text } });
    try {
      const details = await api<AddressPick | null>(`/places/details?id=${encodeURIComponent(suggestion.placeId)}&session=${session.current}`);
      if (details) {
        picked.current = details.address;
        onChange({ target: { value: details.address } });
        onPick?.(details);
      }
    } catch {
      /* the suggestion's text is good enough */
    } finally {
      // The next address typed is a new billing session.
      session.current = newSession();
    }
  };

  // One list for the keyboard: sites first, then addresses.
  const rows: Row[] = [...siteRows.map((site) => ({ kind: "site" as const, site })), ...addressRows.map((suggestion) => ({ kind: "address" as const, suggestion }))];
  const choose = (row: Row) => (row.kind === "site" ? chooseSite(row.site) : void chooseAddress(row.suggestion));
  const showing = open && rows.length > 0;

  const option = (row: Row, index: number) => (
    <li key={row.kind === "site" ? `site-${row.site.id}` : row.suggestion.placeId} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
      <button
        type="button"
        tabIndex={-1}
        // Keep focus in the box so the list doesn't close before the tap lands.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(row)}
        className={cn("flex min-h-touch w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted", index === active && "bg-muted")}
      >
        {row.kind === "site" ? (
          <>
            {row.site.kind === "MANAGED" ? <Building2 className="size-5 shrink-0 text-primary" /> : <Home className="size-5 shrink-0 text-primary" />}
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {row.site.name}
                {row.site.archived && <span className="ml-2 text-xs font-normal text-muted-foreground">Archived</span>}
              </span>
              {row.site.address !== row.site.name && <span className="block truncate text-sm text-muted-foreground">{row.site.address}</span>}
            </span>
          </>
        ) : (
          <>
            <MapPin className="size-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{row.suggestion.main}</span>
              {row.suggestion.secondary && <span className="block truncate text-sm text-muted-foreground">{row.suggestion.secondary}</span>}
            </span>
          </>
        )}
      </button>
    </li>
  );

  return (
    <div className={cn("relative flex flex-col gap-2 lg:max-w-2xl", className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        value={value}
        autoComplete={suggesting ? "off" : "street-address"}
        role={suggesting ? "combobox" : undefined}
        aria-expanded={suggesting ? showing : undefined}
        aria-controls={suggesting ? listId : undefined}
        aria-autocomplete={suggesting ? "list" : undefined}
        aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={!!error || undefined}
        aria-describedby={hint || error ? helpId : undefined}
        onChange={(event) => {
          typed.current = true;
          picked.current = null;
          onChange({ target: { value: event.target.value } });
        }}
        onFocus={() => rows.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (!showing) return;
          if (event.key === "ArrowDown") (event.preventDefault(), setActive((current) => Math.min(rows.length - 1, current + 1)));
          else if (event.key === "ArrowUp") (event.preventDefault(), setActive((current) => Math.max(0, current - 1)));
          else if (event.key === "Enter" && active >= 0) (event.preventDefault(), choose(rows[active]!));
          else if (event.key === "Escape") setOpen(false);
        }}
        {...props}
      />
      {showing && (
        <div id={listId} role="listbox" aria-label={`${label} suggestions`} className="absolute top-full right-0 left-0 z-50 mt-1 max-h-[60vh] overflow-y-auto overscroll-contain rounded-xl border bg-popover text-popover-foreground shadow-xl">
          {siteRows.length > 0 && (
            <div role="group" aria-label="Your sites" className="p-1.5">
              <p className="px-3 pt-1 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Your sites</p>
              <ul>{rows.map((row, index) => (row.kind === "site" ? option(row, index) : null))}</ul>
            </div>
          )}
          {addressRows.length > 0 && (
            <div role="group" aria-label="Addresses" className={cn("p-1.5", siteRows.length > 0 && "border-t")}>
              <p className="px-3 pt-1 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Addresses</p>
              <ul>{rows.map((row, index) => (row.kind === "address" ? option(row, index) : null))}</ul>
              {/* Google's terms: suggestions shown without a map say where they came from. */}
              <p className="px-3 pt-1 text-right text-xs text-muted-foreground">Powered by Google</p>
            </div>
          )}
        </div>
      )}
      {error ? (
        <p id={helpId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={helpId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
