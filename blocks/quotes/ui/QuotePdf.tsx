"use client";

// A quote's PDF on its own page inside Grid (/quotes/<id>/pdf), instead of
// a browser tab or the phone's PDF app, which leave the installed app. The
// server turns the PDF into page pictures; Download still gives the file.

import { useEffect, useState } from "react";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Alert, Button, PageHeader, PageViewer, api } from "@grid/ui";

interface PagesJson {
  key: string;
  pages: [number, number][];
  filename: string;
  label: string;
  number: string;
  title: string;
}

export function QuotePdf({ quoteId, which }: { quoteId: string; which: { revisionId: string | null; signed: boolean } }) {
  const [pages, setPages] = useState<PagesJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = which.signed ? "signed=1" : which.revisionId ? `rev=${encodeURIComponent(which.revisionId)}` : "";

  useEffect(() => {
    let current = true;
    api<PagesJson>(`/quotes/${quoteId}/pdf/pages${query ? `?${query}` : ""}`)
      .then((result) => current && setPages(result))
      .catch((failure: Error) => current && setError(failure.message));
    return () => void (current = false);
  }, [quoteId, query]);

  const download = `/api/quotes/${quoteId}/pdf?download=1${query ? `&${query}` : ""}`;
  return (
    <>
      <a href={`/quotes/${quoteId}`} className="mb-2 inline-flex min-h-touch items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {pages ? `${pages.number} ${pages.title}` : "Back to the quote"}
      </a>
      <PageHeader
        title={pages ? `${pages.number} · ${pages.label}` : "Quote PDF"}
        subtitle={pages?.label === "Draft preview" ? "How the quote will look. It's marked DRAFT until it's sent." : undefined}
        actions={
          <Button variant="outline" asChild>
            <a href={download} aria-label="Download the PDF">
              <Download /> <span className="hidden sm:inline">Download</span>
            </a>
          </Button>
        }
      />
      {error ? (
        <Alert variant="error">Couldn&apos;t show the PDF: {error}</Alert>
      ) : !pages ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border bg-card px-4 py-12 text-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
          Getting the PDF ready…
        </div>
      ) : (
        <PageViewer title={pages.filename} pages={pages.pages.map(([width, height], index) => ({ src: `/api/quotes/${quoteId}/pdf/pages/${pages.key}/p${index + 1}.jpg`, width, height }))} />
      )}
    </>
  );
}
