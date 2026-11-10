"use client";

// Quotes list: open quotes first, searchable, one row per quote.
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { ActionButton, Badge, EmptyState, List, PageHeader, SearchInput, Section, Segmented, Stack, api } from "@grid/ui";
import { formatMoney } from "../money";
import { StatusBadge } from "./StatusBadge";

export interface QuoteRowJson {
  id: string;
  number: string;
  title: string;
  clientName: string | null;
  siteAddress: string | null;
  status: string;
  totalCents: number;
  validUntil: string;
  sentAt: string | null;
  viewedAt: string | null;
  updatedAt: string;
}

type Tab = "open" | "draft" | "sent" | "won" | "all";

export function QuotesList({ initial, currency, locale, canCreate }: { initial: QuoteRowJson[]; currency: string; locale: string; canCreate: boolean }) {
  const [tab, setTab] = useState<Tab>("open");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState(initial);
  const [first, setFirst] = useState(true);

  useEffect(() => {
    if (first) {
      setFirst(false);
      return;
    }
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ tab });
      if (query.trim()) params.set("q", query.trim());
      setRows(await api<QuoteRowJson[]>(`/quotes?${params}`).catch(() => rows));
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query]);

  const total = rows.filter((row) => row.status === "SENT").reduce((total, row) => total + row.totalCents, 0);

  return (
    <>
      <PageHeader
        title="Quotes"
        meta={tab === "open" && total > 0 ? `${formatMoney(total, currency, locale)} waiting for an answer` : undefined}
        actions={canCreate && <ActionButton icon={<Plus />} label="New quote" onClick={() => (window.location.href = "/b/quotes/new")} />}
      />
      <Stack>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Segmented
            label="Show"
            value={tab}
            onChange={setTab}
            items={[
              { value: "open", label: "Open" },
              { value: "draft", label: "Drafts" },
              { value: "sent", label: "Sent" },
              { value: "won", label: "Won" },
              { value: "all", label: "All" },
            ]}
          />
          <SearchInput label="Search quotes" placeholder="Number, job, client or address" value={query} onChange={(event) => setQuery(event.target.value)} className="flex-1" />
        </div>
        <Section flush>
          {rows.length === 0 ? (
            <EmptyState title={query ? "No quotes match" : tab === "open" ? "No open quotes" : "Nothing here yet"}>
              {canCreate && !query && <a href="/b/quotes/new">Write a quote</a>}
            </EmptyState>
          ) : (
            <List>
              {rows.map((row) => {
                const expired = row.status === "SENT" && new Date(row.validUntil) < new Date();
                return (
                  <li key={row.id}>
                    <a href={`/b/quotes/${row.id}`} className="flex min-h-touch-lg items-center gap-3 px-4 py-2.5 hover:bg-muted active:bg-muted sm:px-5">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-semibold">{row.title}</span>
                          <StatusBadge status={row.status} viewed={!!row.viewedAt} />
                          {expired && <Badge variant="warning">Past valid date</Badge>}
                        </span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {[row.number, row.clientName, row.siteAddress].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{formatMoney(row.totalCents, currency, locale)}</span>
                    </a>
                  </li>
                );
              })}
            </List>
          )}
        </Section>
      </Stack>
    </>
  );
}
