"use client";

// "How did they find you?" on the client form (docs/quotations-block.md
// "Lead source"): one tap on a chip, optional. Referral also asks who
// referred them, picked from your clients.
import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { Button, SearchInput, api, cn } from "@grid/ui";

export interface LeadSourceJson {
  id: string;
  name: string;
  isReferral: boolean;
  hidden: boolean;
  clientCount: number;
}

export interface ReferrerJson {
  id: string;
  label: string;
}

export function LeadSourceField({
  value,
  referrer,
  clientId,
  onChange,
}: {
  /** The chosen lead source: id, name and whether it's the referral one. */
  value: { id: string; name: string; isReferral: boolean } | null;
  referrer: ReferrerJson | null;
  /** The client being edited (they can't refer themselves). */
  clientId?: string;
  onChange: (source: { id: string; name: string; isReferral: boolean } | null, referrer: ReferrerJson | null) => void;
}) {
  const [sources, setSources] = useState<LeadSourceJson[] | null>(null);
  useEffect(() => {
    api<LeadSourceJson[]>("/clients/lead-sources")
      .then(setSources)
      .catch(() => setSources([]));
  }, []);
  // A hidden one the client already has still shows, so it isn't lost by saving.
  const shown = sources ? (value && !sources.some((source) => source.id === value.id) ? [...sources, { ...value, hidden: true, clientCount: 0 }] : sources) : [];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">How did they find you?</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="How did they find you?">
        {sources === null && <span className="text-sm text-muted-foreground">Loading…</span>}
        {shown.map((source) => {
          const chosen = value?.id === source.id;
          return (
            <button
              key={source.id}
              type="button"
              aria-pressed={chosen}
              // Tap again to clear it.
              onClick={() => onChange(chosen ? null : { id: source.id, name: source.name, isReferral: source.isReferral }, chosen || !source.isReferral ? null : referrer)}
              className={cn(
                "min-h-touch rounded-full border px-4 text-sm font-semibold",
                chosen ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted",
              )}
            >
              {source.name}
            </button>
          );
        })}
      </div>
      {value?.isReferral && <ReferrerField value={referrer} clientId={clientId} onChange={(next) => onChange(value, next)} />}
    </div>
  );
}

/** Who referred them: one of your clients, or nobody picked. */
function ReferrerField({ value, clientId, onChange }: { value: ReferrerJson | null; clientId?: string; onChange: (referrer: ReferrerJson | null) => void }) {
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ReferrerJson[]>([]);
  useEffect(() => {
    if (!choosing) return;
    const timer = setTimeout(() => {
      api<ReferrerJson[]>(`/clients?q=${encodeURIComponent(query)}`)
        .then((clients) => setRows(clients.filter((client) => client.id !== clientId)))
        .catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [choosing, query, clientId]);
  const pick = (referrer: ReferrerJson | null) => {
    onChange(referrer);
    setChoosing(false);
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Who referred them? (optional)</span>
      {!choosing ? (
        <button type="button" onClick={() => setChoosing(true)} className="flex min-h-touch w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-left">
          <span className="flex min-w-0 items-center gap-2">
            <UserRound className="size-4 shrink-0 text-muted-foreground" />
            {value ? <span className="truncate font-medium">{value.label}</span> : <span className="text-muted-foreground">Not picked</span>}
          </span>
          <span className="text-sm font-semibold text-primary">{value ? "Change" : "Choose"}</span>
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border p-2">
          <SearchInput label="Search your clients" placeholder="Name or business" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
          <ul className="flex flex-col divide-y">
            {rows.slice(0, 6).map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => pick({ id: row.id, label: row.label })} className="flex min-h-touch w-full items-center px-2 py-1.5 text-left font-medium hover:bg-muted">
                  {row.label}
                </button>
              </li>
            ))}
            {rows.length === 0 && <li className="px-2 py-2 text-sm text-muted-foreground">{query ? "No clients match" : "No other clients yet"}</li>}
          </ul>
          <div className="flex gap-2">
            {value && (
              <Button type="button" variant="ghost" onClick={() => pick(null)}>
                Nobody picked
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
