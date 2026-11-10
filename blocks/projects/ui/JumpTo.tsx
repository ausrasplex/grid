"use client";

// Jump to search (docs/navigation.md §6): job numbers, job names,
// customers, sites and addresses. An exact job number is always first and
// Enter jumps straight to it. Nothing typed shows your recent jobs.

import { useEffect, useRef, useState } from "react";
import { Badge, EmptyState, Icon, List, PageHeader, SearchInput, Section, Stack, api } from "@grid/ui";
import type { SearchResult } from "../service";

interface Results {
  exact: SearchResult | null;
  jobs: SearchResult[];
  sites: SearchResult[];
}

export function JumpTo() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<Results | null>(null);
  const requestCounter = useRef(0);

  useEffect(() => {
    const requestNumber = ++requestCounter.current;
    const timer = setTimeout(async () => {
      try {
        const result = await api<Results>(`/projects/search?q=${encodeURIComponent(query.trim())}`);
        if (requestNumber === requestCounter.current) setResponse(result);
      } catch {
        /* keep the last results */
      }
    }, query ? 150 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  const first = response?.exact ?? response?.jobs[0] ?? response?.sites[0];

  return (
    <>
      <PageHeader title="Jump to" subtitle="Job number, job, customer, site or address." />
      <Stack>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (first) window.location.href = first.href;
          }}
        >
          <SearchInput label="Search" placeholder="e.g. 1042, Nguyen, Smith St" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} />
        </form>
        {response?.exact && (
          <Group title="Exact match">
            <Row result={response.exact} highlight />
          </Group>
        )}
        {response && response.jobs.length > 0 && (
          <Group title={query.trim() ? "Jobs" : "Recent jobs"}>
            {response.jobs.map((job) => (
              <Row key={job.id} result={job} />
            ))}
          </Group>
        )}
        {response && response.sites.length > 0 && (
          <Group title="Sites">
            {response.sites.map((site) => (
              <Row key={site.id} result={site} />
            ))}
          </Group>
        )}
        {response && query.trim() && !response.exact && !response.jobs.length && !response.sites.length && (
          <Section>
            <EmptyState title="Nothing found">Try a different number, or part of the street or customer's name.</EmptyState>
          </Section>
        )}
      </Stack>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <Section flush>
        <List>{children}</List>
      </Section>
    </section>
  );
}

function Row({ result, highlight }: { result: SearchResult; highlight?: boolean }) {
  return (
    <li>
      <a href={result.href} className="flex min-h-touch-lg items-center gap-3 px-4 py-3 hover:bg-muted active:bg-muted sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground [&_svg]:size-5">
          <Icon name={result.type === "job" ? "job" : "map"} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{result.title}</span>
            {highlight && <Badge variant="default">Enter</Badge>}
          </span>
          <span className="block truncate text-sm text-muted-foreground">{[result.meta, result.trail].filter(Boolean).join(" · ")}</span>
        </span>
        <Icon name="chevron-right" className="size-5 text-muted-foreground" />
      </a>
    </li>
  );
}
