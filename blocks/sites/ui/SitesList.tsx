"use client";

// Sites list (docs/navigation.md §4): Active · Mine · Archived, search by
// site, address or customer, most recently opened first.

import { useEffect, useState } from "react";
import {
  ActionButton,
  Alert,
  Badge,
  EmptyState,
  Icon,
  List,
  Loading,
  PageHeader,
  SearchInput,
  Section,
  Segmented,
  Stack,
  useApi,
} from "@grid/ui";
import type { SiteListRow, SitesTab } from "../service";

type Row = Omit<SiteListRow, "archivedAt" | "lastOpenedAt"> & { archivedAt: string | null; lastOpenedAt: string | null };

const date = (value: string) => new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function SitesList({ solo, canCreateJob, canCreateSite }: { solo: boolean; canCreateJob: boolean; canCreateSite: boolean }) {
  const [tab, setTab] = useState<SitesTab>("active");
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchText.trim()), 200);
    return () => clearTimeout(timer);
  }, [searchText]);

  const { data, error, loading } = useApi<Row[]>(`/sites?tab=${tab}${query ? `&q=${encodeURIComponent(query)}` : ""}`);

  const tabs: { value: SitesTab; label: string }[] = [
    { value: "active", label: "Active" },
    // "Mine" only means something once there's a team.
    ...(solo ? [] : [{ value: "mine" as const, label: "Mine" }]),
    { value: "archived", label: "Archived" },
  ];

  return (
    <>
      <PageHeader
        title="Sites"
        actions={
          <>
            {canCreateSite && !solo && (
              <ActionButton variant="outline" icon={<Icon name="building" />} label="New site" onClick={() => (window.location.href = "/b/sites/new")} />
            )}
            {canCreateJob && <ActionButton icon={<Icon name="plus" />} label="New job" onClick={() => (window.location.href = "/b/projects/new")} />}
          </>
        }
      />
      <Stack>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Segmented label="Which sites" items={tabs} value={tab} onChange={setTab} />
          <SearchInput
            label="Search sites"
            placeholder="Address, customer or site name"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="flex-1"
          />
        </div>
        {loading && !data ? (
          <Loading rows={4} />
        ) : error ? (
          <Alert variant="error">{error}</Alert>
        ) : !data?.length ? (
          <Section>
            <EmptyState title={query ? "No sites match that" : tab === "archived" ? "Nothing archived yet" : "No sites yet"}>
              {query
                ? "Try part of the street name or the customer's surname."
                : tab === "archived"
                  ? "A site moves here by itself when its last job is finished."
                  : "Start a job with an address and its site appears here."}
            </EmptyState>
          </Section>
        ) : (
          <Section flush>
            <List>
              {data.map((site) => (
                <li key={site.id}>
                  <a
                    href={`/b/projects/site/${site.id}`}
                    className="flex min-h-touch-lg items-center gap-3 px-4 py-3 transition-colors hover:bg-muted active:bg-muted sm:px-5"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground [&_svg]:size-5">
                      <Icon name={site.kind === "MANAGED" ? "building" : "home"} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold">{site.name}</span>
                        {site.kind === "MANAGED" && <Badge>Managed</Badge>}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {site.archivedAt
                          ? `Archived ${date(site.archivedAt)} · ${site.totalJobs} earlier job${site.totalJobs === 1 ? "" : "s"}`
                          : `${site.activeJobs} active job${site.activeJobs === 1 ? "" : "s"}${site.address !== site.name ? ` · ${site.address}` : ""}`}
                      </span>
                    </span>
                    <Icon name="chevron-right" className="size-5 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </List>
          </Section>
        )}
      </Stack>
    </>
  );
}
