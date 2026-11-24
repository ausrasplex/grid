"use client";

// The handover PDF on its own page inside Grid (/handover/<job>/pdf),
// instead of a browser tab or the phone's PDF app, which leave the
// installed app. The server turns the PDF into page pictures; Download
// still gives the file.

import { useEffect, useState } from "react";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Alert, Button, PageHeader, PageViewer, api } from "@grid/ui";

interface PagesJson {
  key: string;
  pages: [number, number][];
  filename: string;
  title: string;
  lineCount: number;
}

export function SchedulePdf({ projectId, jobName }: { projectId: string; jobName: string }) {
  const [pages, setPages] = useState<PagesJson | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    api<PagesJson>(`/handover/job/${projectId}/pdf/pages`)
      .then((result) => current && setPages(result))
      .catch((failure: Error) => current && setError(failure.message));
    return () => void (current = false);
  }, [projectId]);

  return (
    <>
      <a href={`/handover/${projectId}`} className="mb-2 inline-flex min-h-touch items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Handover · {jobName}
      </a>
      <PageHeader
        title={pages?.title ?? "Handover PDF"}
        meta={jobName}
        actions={
          <Button variant="outline" asChild>
            <a href={`/api/handover/job/${projectId}/pdf?download=1`} aria-label="Download the PDF">
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
        <PageViewer title={pages.filename} pages={pages.pages.map(([width, height], index) => ({ src: `/api/handover/job/${projectId}/pdf/pages/${pages.key}/p${index + 1}.jpg`, width, height }))} />
      )}
    </>
  );
}
