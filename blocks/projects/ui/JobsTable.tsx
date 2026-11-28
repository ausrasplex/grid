"use client";

// /jobs: every job of the business in one searchable, sortable table, with
// what each holds (photos, plan sheets, documents) and, for people who
// finish jobs, how much space it takes. A table from tablet up; cards on a
// phone. docs/stage-2-projects.md "Job storage".

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import type { JobSecondStatus } from "@grid/core";
import { SecondStatus } from "./SecondStatus";
import { ActionButton, Badge, EmptyState, List, PageHeader, Scroller, SearchInput, Section, Segmented, Stack, cn, formatBytes } from "@grid/ui";

export interface JobsTableRowJson {
  id: string;
  name: string;
  jobNumber: string | null;
  clientName: string | null;
  siteName: string;
  address: string;
  status: "ACTIVE" | "COMPLETED" | "QUOTING" | "NOT_WON";
  /** Finished and archived (phase 2e). */
  archived: boolean;
  startedAt: string;
  counts: Record<string, number>;
  storage: { originalBytes: number; copyBytes: number; archiveBytes: number; deletedBytes: number; unmeasured: number } | null;
  /** Active jobs: "Scheduled", "To be booked" (from Scheduling), or null. */
  secondStatus: JobSecondStatus | null;
}

type Tab = "active" | "finished" | "archived" | "all";
/** "name", "client", "started", "size", or a count column's key. */
type SortKey = string;

const date = (value: string) => new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
/** Quoting and Not won jobs (a quote's job, phase 4c) only show under All. */
const tabOf = (row: JobsTableRowJson): Exclude<Tab, "all"> | null =>
  row.status === "QUOTING" || row.status === "NOT_WON" ? null : row.archived ? "archived" : row.status === "ACTIVE" ? "active" : "finished";
const STATUS_BADGE: Partial<Record<JobsTableRowJson["status"], string>> = { COMPLETED: "Finished", QUOTING: "Quoting", NOT_WON: "Not won" };
const sizeOf = (row: JobsTableRowJson) => (row.storage ? row.storage.originalBytes + row.storage.copyBytes : 0);

export function JobsTable({
  rows,
  columns,
  showStorage,
  canCreate,
}: {
  rows: JobsTableRowJson[];
  columns: { key: string; label: string }[];
  showStorage: boolean;
  canCreate: boolean;
}) {
  const [tab, setTab] = useState<Tab>("active");
  // Within Active: one second status ("Scheduled", "To be booked"), or all.
  const [second, setSecond] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: "started", descending: true });

  const counts = {
    active: rows.filter((row) => tabOf(row) === "active").length,
    finished: rows.filter((row) => tabOf(row) === "finished").length,
    archived: rows.filter((row) => tabOf(row) === "archived").length,
    all: rows.length,
  };

  // The second statuses active jobs have, in a fixed order, with counts.
  const secondOptions = useMemo(() => {
    const found = new Map<string, { label: string; count: number }>();
    for (const row of rows) {
      if (tabOf(row) !== "active" || !row.secondStatus) continue;
      const entry = found.get(row.secondStatus.key) ?? { label: row.secondStatus.label, count: 0 };
      found.set(row.secondStatus.key, { ...entry, count: entry.count + 1 });
    }
    const order = ["scheduled", "tentative", "toBook", "visitsDone"];
    return [...found].sort(([first], [other]) => order.indexOf(first) - order.indexOf(other)).map(([value, entry]) => ({ value, label: entry.label, count: entry.count }));
  }, [rows]);
  const secondFilter = tab === "active" && secondOptions.some((option) => option.value === second) ? second : "all";

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const inTab = rows.filter((row) => (tab === "all" || tabOf(row) === tab) && (secondFilter === "all" || row.secondStatus?.key === secondFilter));
    const matching = words.length
      ? inTab.filter((row) => {
          const text = [row.jobNumber, row.name, row.clientName, row.siteName, row.address].filter(Boolean).join(" ").toLowerCase();
          return words.every((word) => text.includes(word));
        })
      : inTab;
    const valueOf = (row: JobsTableRowJson): string | number => {
      if (sort.key === "name") return row.name.toLowerCase();
      if (sort.key === "client") return (row.clientName ?? "").toLowerCase();
      if (sort.key === "address") return row.address.toLowerCase();
      if (sort.key === "started") return row.startedAt;
      if (sort.key === "size") return sizeOf(row);
      return row.counts[sort.key] ?? 0;
    };
    return [...matching].sort((first, second) => {
      const firstValue = valueOf(first);
      const secondValue = valueOf(second);
      const order = firstValue < secondValue ? -1 : firstValue > secondValue ? 1 : 0;
      return sort.descending ? -order : order;
    });
  }, [rows, tab, query, sort, secondFilter]);

  const totalSize = shown.reduce((total, row) => total + sizeOf(row), 0);
  // Numbers and dates start biggest/newest first; words start A to Z.
  const sortBy = (key: SortKey) =>
    setSort((current) => (current.key === key ? { key, descending: !current.descending } : { key, descending: !["name", "client", "address"].includes(key) }));

  const header = (key: SortKey, label: string, numeric = false) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.descending ? "descending" : "ascending") : undefined} className={cn("p-0 font-semibold", numeric && "text-right")}>
      <button
        type="button"
        onClick={() => sortBy(key)}
        className={cn("inline-flex h-touch w-full items-center gap-1 px-3 whitespace-nowrap hover:text-foreground", numeric && "justify-end", sort.key === key ? "text-foreground" : "text-muted-foreground")}
      >
        {label}
        {sort.key === key && (sort.descending ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUp className="size-3.5" aria-hidden />)}
      </button>
    </th>
  );

  return (
    <>
      <PageHeader
        title="Jobs"
        meta={showStorage && shown.length ? `${shown.length} job${shown.length === 1 ? "" : "s"} · ${formatBytes(totalSize)}` : `${shown.length} job${shown.length === 1 ? "" : "s"}`}
        actions={canCreate && <ActionButton icon={<Plus />} label="New job" onClick={() => (window.location.href = "/jobs/new")} />}
      />
      <Stack>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Segmented
            label="Show"
            value={tab}
            onChange={setTab}
            items={[
              { value: "active", label: "Active", count: counts.active },
              { value: "finished", label: "Finished", count: counts.finished },
              ...(counts.archived ? [{ value: "archived" as const, label: "Archived", count: counts.archived }] : []),
              { value: "all", label: "All", count: counts.all },
            ]}
          />
          <SearchInput label="Search jobs" placeholder="Job number, name, client or address" value={query} onChange={(event) => setQuery(event.target.value)} className="flex-1" />
        </div>

        {/* Active jobs by their second status: Scheduled, To be booked… */}
        {tab === "active" && secondOptions.length > 1 && (
          <Segmented label="Active jobs that are" value={secondFilter} onChange={setSecond} items={[{ value: "all", label: "All active", count: counts.active }, ...secondOptions]} />
        )}

        {/* Phone: quick sort, since there are no column headings to tap. */}
        <div className="md:hidden">
          <Segmented
            label="Sort by"
            value={sort.key === "size" ? "size" : sort.key === "name" ? "name" : "started"}
            onChange={(key) => setSort({ key, descending: key !== "name" })}
            items={[
              { value: "started", label: "Newest" },
              { value: "name", label: "A to Z" },
              ...(showStorage ? [{ value: "size", label: "Biggest" }] : []),
            ]}
          />
        </div>

        <Section flush>
          {shown.length === 0 ? (
            <EmptyState title={query ? "No jobs match" : tab === "active" ? "No active jobs" : "Nothing here yet"}>{canCreate && !query && <a href="/jobs/new">Start a job</a>}</EmptyState>
          ) : (
            <>
              <div className="md:hidden">
                <List>
                  {shown.map((row) => (
                    <li key={row.id}>
                      <a href={`/jobs/${row.id}`} className="flex min-h-touch-lg items-center gap-3 px-4 py-2.5 hover:bg-muted active:bg-muted">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-semibold">{row.name}</span>
                            {row.archived ? <Badge variant="outline">Archived</Badge> : STATUS_BADGE[row.status] ? <Badge variant="secondary">{STATUS_BADGE[row.status]}</Badge> : row.secondStatus && <SecondStatus status={row.secondStatus} />}
                          </span>
                          <span className="block truncate text-sm text-muted-foreground">{[row.jobNumber, row.clientName, row.address].filter(Boolean).join(" · ")}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {columns
                              .filter((column) => row.counts[column.key])
                              .map((column) => `${row.counts[column.key]} ${column.label.toLowerCase()}`)
                              .join(" · ") || `Started ${date(row.startedAt)}`}
                          </span>
                        </span>
                        {row.storage && <span className="shrink-0 text-sm font-semibold tabular-nums">{formatBytes(sizeOf(row))}</span>}
                      </a>
                    </li>
                  ))}
                </List>
              </div>

              <Scroller axis="x" className="hidden md:block">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left">
                      {header("name", "Job")}
                      {header("client", "Client")}
                      {header("address", "Address")}
                      {header("started", "Started")}
                      {columns.map((column) => header(column.key, column.label, true))}
                      {showStorage && header("size", "Size", true)}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {shown.map((row) => (
                      <tr key={row.id} className="cursor-pointer hover:bg-muted" onClick={() => (window.location.href = `/jobs/${row.id}`)}>
                        <td className="max-w-72 px-3 py-2">
                          <a href={`/jobs/${row.id}`} className="block truncate font-semibold" onClick={(event) => event.stopPropagation()}>
                            {row.name}
                          </a>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {row.jobNumber}
                            {row.archived ? <Badge variant="outline">Archived</Badge> : STATUS_BADGE[row.status] ? <Badge variant="secondary">{STATUS_BADGE[row.status]}</Badge> : row.secondStatus && <SecondStatus status={row.secondStatus} />}
                          </span>
                        </td>
                        <td className="max-w-48 truncate px-3 py-2">{row.clientName ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="max-w-64 truncate px-3 py-2 text-muted-foreground">{row.address}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{date(row.startedAt)}</td>
                        {columns.map((column) => (
                          <td key={column.key} className="px-3 py-2 text-right tabular-nums">
                            {row.counts[column.key] ?? 0}
                          </td>
                        ))}
                        {showStorage && (
                          <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums" title={row.storage ? `${formatBytes(row.storage.originalBytes)} uploaded, ${formatBytes(row.storage.copyBytes)} viewing copies` : undefined}>
                            {formatBytes(sizeOf(row))}
                            {row.storage?.unmeasured ? <span className="text-muted-foreground"> +</span> : null}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroller>
            </>
          )}
        </Section>
        {showStorage && <p className="px-1 text-xs text-muted-foreground">Size is what's uploaded plus Grid's viewing copies (thumbnails, plan tiles, page pictures). A + means some older copies are measured overnight.</p>}
      </Stack>
    </>
  );
}
