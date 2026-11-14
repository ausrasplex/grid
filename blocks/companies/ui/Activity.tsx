"use client";

// Settings › Activity: who changed what, when, and from which device and IP
// address, newest first, a day at a time. Tap a row for the details.

import { useEffect, useState } from "react";
import { Alert, Button, EmptyState, Loading, PageHeader, Section, SelectField, Stack, api, describeDevice } from "@grid/ui";

export interface ActivityJson {
  id: string;
  at: string;
  who: string | null;
  whoId: string | null;
  summary: string;
  what: string | null;
  part: string;
  details: unknown;
  ip: string | null;
  userAgent: string | null;
}

const day = (value: string) => new Date(value).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const time = (value: string) => new Date(value).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });

export function Activity({ people }: { people: { id: string; name: string }[] }) {
  const [person, setPerson] = useState("");
  const [rows, setRows] = useState<ActivityJson[] | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = async (before?: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ ...(person ? { person } : {}), ...(before ? { before } : {}) });
      const page = await api<{ rows: ActivityJson[]; more: boolean }>(`/companies/current/activity?${query}`);
      setRows((current) => (before && current ? [...current, ...page.rows] : page.rows));
      setMore(page.more);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setRows(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person]);

  // Group by day, newest first.
  const days: { label: string; rows: ActivityJson[] }[] = [];
  for (const row of rows ?? []) {
    const label = day(row.at);
    const last = days.at(-1);
    if (last?.label === label) last.rows.push(row);
    else days.push({ label, rows: [row] });
  }

  return (
    <>
      <PageHeader title="Activity" subtitle="Who changed what, when, and from which device and IP address." />
      <Stack>
        {people.length > 1 && (
          <div className="lg:max-w-sm">
            <SelectField
              label="Who"
              value={person}
              onChange={(event) => setPerson(event.target.value)}
              options={[{ value: "", label: "Everyone" }, ...people.map((member) => ({ value: member.id, label: member.name }))]}
            />
          </div>
        )}
        <Alert variant="error">{error}</Alert>
        {rows === null ? (
          <Loading rows={6} />
        ) : rows.length === 0 ? (
          <Section>
            <EmptyState title="Nothing yet">Changes show here as people use Grid.</EmptyState>
          </Section>
        ) : (
          days.map((group) => (
            <Section key={group.label} title={group.label} flush>
              <ul className="divide-y">
                {group.rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      aria-expanded={open === row.id}
                      onClick={() => setOpen(open === row.id ? null : row.id)}
                      className="flex min-h-touch-lg w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-muted sm:px-5"
                    >
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold">{row.summary}</span>
                        {row.what && <span className="truncate text-muted-foreground">&ldquo;{row.what}&rdquo;</span>}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {[row.who ?? "Grid", time(row.at), row.part].join(" · ")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.ip || row.userAgent ? [row.userAgent ? describeDevice(row.userAgent) : null, row.ip].filter(Boolean).join(" · ") : "No device recorded"}
                      </span>
                    </button>
                    {open === row.id && (
                      <div className="flex flex-col gap-2 px-4 pb-4 sm:px-5">
                        {row.userAgent && <p className="text-xs break-all text-muted-foreground">Browser: {row.userAgent}</p>}
                        {row.details != null ? (
                          <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{JSON.stringify(row.details, null, 2)}</pre>
                        ) : (
                          <p className="text-xs text-muted-foreground">No more details were recorded.</p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          ))
        )}
        {more && (
          <div>
            <Button variant="outline" size="lg" disabled={loading} onClick={() => void load(rows?.at(-1)?.id)}>
              {loading ? "Loading…" : "Show older"}
            </Button>
          </div>
        )}
      </Stack>
    </>
  );
}
