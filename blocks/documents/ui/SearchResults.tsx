"use client";

// "Inside documents": what a search finds in the text of PDFs and the cells
// of spreadsheets (docs/documents-block.md "Search"), under the title
// matches. Each result opens the document at that page (or sheet) with the
// words already found.

import { Fragment, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { List, Section, api } from "@grid/ui";
import { KindIcon } from "./shared";
import type { DocumentKind } from "../kinds";

interface SearchHitJson {
  documentId: string;
  title: string;
  where: string;
  kind: DocumentKind;
  pages: { page: number; sheetName: string | null; snippet: string }[];
}

/** A snippet from the server, with the matching words between « and », as text with <mark>s. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("«") && part.endsWith("»") ? (
          <mark key={index} className="rounded-sm bg-primary/30 px-0.5 text-foreground">
            {part.slice(1, -1)}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function SearchResults({ query, projectId }: { query: string; projectId?: string }) {
  const typed = query.trim();
  const [state, setState] = useState<{ query: string; hits: SearchHitJson[] | null; error: string | null }>({ query: "", hits: null, error: null });

  useEffect(() => {
    if (typed.length < 3) return;
    let alive = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: typed });
      if (projectId) params.set("job", projectId);
      api<SearchHitJson[]>(`/documents/search?${params}`)
        .then((hits) => alive && setState({ query: typed, hits, error: null }))
        .catch((error: Error) => alive && setState({ query: typed, hits: null, error: error.message }));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [typed, projectId]);

  if (typed.length < 3) return null;
  const loading = state.query !== typed;
  const hits = loading ? null : state.hits;

  return (
    <Section title="Inside documents" description="Words in PDFs and spreadsheets. Tap a result to open it at that page." flush>
      {loading ? (
        <p className="flex items-center gap-2 px-4 pb-4 text-sm text-muted-foreground sm:px-6">
          <Loader2 className="size-4 animate-spin" /> Searching…
        </p>
      ) : state.error ? (
        <p className="px-4 pb-4 text-sm text-destructive sm:px-6">{state.error}</p>
      ) : !hits?.length ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-6">Nothing inside documents matches “{typed}”. Scanned documents can&apos;t be searched yet.</p>
      ) : (
        <List>
          {hits.map((hit) => (
            <li key={hit.documentId} className="px-4 py-3 sm:px-6">
              <a href={`/documents/doc/${hit.documentId}?page=${hit.pages[0]?.page ?? 1}&q=${encodeURIComponent(typed)}`} className="flex min-h-touch items-center gap-3 font-semibold hover:underline">
                <KindIcon kind={hit.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{hit.title}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">{hit.where}</span>
                </span>
              </a>
              <ul className="mt-1 flex flex-col gap-1">
                {hit.pages.map((page) => (
                  <li key={page.page}>
                    <a href={`/documents/doc/${hit.documentId}?page=${page.page}&q=${encodeURIComponent(typed)}`} className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                      <span className="mr-2 font-semibold whitespace-nowrap text-muted-foreground">{page.sheetName ? `Sheet: ${page.sheetName}` : `Page ${page.page}`}</span>
                      <Snippet text={page.snippet} />
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </List>
      )}
    </Section>
  );
}
