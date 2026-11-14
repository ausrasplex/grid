"use client";

// An address box that suggests real addresses as you type (Google Maps,
// when the server admin has turned it on in Settings › Maps). Picking one
// fills in the whole address. Without it, or offline, it's a plain text box:
// typing an address always works.
//
// Same shape as Field (label, hint, value, onChange with event.target.value),
// so it drops in wherever an address is typed.

import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
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

export interface AddressPick {
  address: string;
  location: { lat: number; lng: number } | null;
}

/** Once the server says suggestions are off, stop asking until the page reloads. */
let suggestionsOff = false;

const newSession = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function AddressField({
  label,
  hint,
  error,
  value,
  onChange,
  onPick,
  id,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  label: string;
  hint?: string;
  error?: string | null;
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  /** After a suggestion is picked: the full address and where it is. */
  onPick?: (pick: AddressPick) => void;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const helpId = `${inputId}-help`;
  const listId = `${inputId}-suggestions`;
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [enabled, setEnabled] = useState(!suggestionsOff);
  const session = useRef(newSession());
  /** The text a suggestion was just picked as (don't search it again). */
  const picked = useRef<string | null>(null);
  /** Only search after the person types, not for a value filled in from elsewhere. */
  const typed = useRef(false);

  useEffect(() => {
    const query = value.trim();
    if (!enabled || suggestionsOff || !typed.current || query.length < 3 || query === picked.current) {
      setItems([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const result = await api<{ enabled: boolean; suggestions: Suggestion[] }>(`/places/autocomplete?q=${encodeURIComponent(query)}&session=${session.current}`);
        if (!alive) return;
        if (!result.enabled) {
          suggestionsOff = true;
          setEnabled(false);
          return;
        }
        setItems(result.suggestions);
        setActive(-1);
        setOpen(result.suggestions.length > 0);
      } catch {
        if (alive) setItems([]);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [value, enabled]);

  const choose = async (suggestion: Suggestion) => {
    setOpen(false);
    setItems([]);
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

  const showing = open && items.length > 0;
  return (
    <div className={cn("relative flex flex-col gap-2 lg:max-w-2xl", className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        value={value}
        autoComplete={enabled ? "off" : "street-address"}
        role={enabled ? "combobox" : undefined}
        aria-expanded={enabled ? showing : undefined}
        aria-controls={enabled ? listId : undefined}
        aria-autocomplete={enabled ? "list" : undefined}
        aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={!!error || undefined}
        aria-describedby={hint || error ? helpId : undefined}
        onChange={(event) => {
          typed.current = true;
          picked.current = null;
          onChange({ target: { value: event.target.value } });
        }}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (!showing) return;
          if (event.key === "ArrowDown") (event.preventDefault(), setActive((current) => Math.min(items.length - 1, current + 1)));
          else if (event.key === "ArrowUp") (event.preventDefault(), setActive((current) => Math.max(0, current - 1)));
          else if (event.key === "Enter" && active >= 0) (event.preventDefault(), void choose(items[active]!));
          else if (event.key === "Escape") setOpen(false);
        }}
        {...props}
      />
      {showing && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
          <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="p-1.5">
            {items.map((suggestion, index) => (
              <li key={suggestion.placeId} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  tabIndex={-1}
                  // Keep focus in the box so the list doesn't close before the tap lands.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void choose(suggestion)}
                  className={cn("flex min-h-touch w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted", index === active && "bg-muted")}
                >
                  <MapPin className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{suggestion.main}</span>
                    {suggestion.secondary && <span className="block truncate text-sm text-muted-foreground">{suggestion.secondary}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/* Google's terms: suggestions shown without a map say where they came from. */}
          <p className="border-t px-3 py-1.5 text-right text-xs text-muted-foreground">Powered by Google</p>
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
