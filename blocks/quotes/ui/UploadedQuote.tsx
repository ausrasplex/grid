"use client";

// A quote made outside Grid: its PDF, the details it was uploaded with, and
// its answer (Record acceptance / decline, Withdraw), like any other quote.

import { useState } from "react";
import { FileText } from "lucide-react";
import { Alert, Button, PageHeader, Section, Stack, api, buttonVariants, cn, useAction } from "@grid/ui";
import { formatMoney } from "../money";
import { AnswerSheet, type QuoteJson } from "./QuoteEditor";
import { StatusBadge } from "./StatusBadge";

export type UploadedQuoteJson = QuoteJson & { uploaded: { fileId: string; totalCents: number | null }; sentAt: string | null };

const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : null);

export function UploadedQuote({ quote, canAnswer }: { quote: UploadedQuoteJson; canAnswer: boolean }) {
  const [answering, setAnswering] = useState<"accept" | "decline" | null>(null);
  const action = useAction();
  const reload = () => window.location.reload();
  const rows: [string, string | null][] = [
    ["Client", quote.client?.name ?? null],
    ["Total", quote.uploaded.totalCents != null ? formatMoney(quote.uploaded.totalCents, quote.settings.currency, quote.settings.locale) : null],
    ["Site address", quote.siteAddress],
    ["Sent", day(quote.sentAt)],
    ["Accepted", day(quote.acceptedAt)],
  ];
  return (
    <>
      <PageHeader title={quote.title} meta={quote.number} actions={<StatusBadge status={quote.status} />} />
      <Stack>
        <a
          href={`/quotes/${quote.id}/pdf`}
          className="flex min-h-touch-lg items-center gap-3 rounded-xl bg-card px-4 py-3 hover:bg-muted sm:px-5"
        >
          <FileText className="size-6 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Open the quote PDF</span>
            <span className="block text-sm text-muted-foreground">Made outside Grid, uploaded here</span>
          </span>
        </a>
        <Section title="Details" flush>
          <dl className="divide-y">
            {rows
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="flex gap-4 px-4 py-3 sm:px-5">
                  <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 flex-1">{value}</dd>
                </div>
              ))}
          </dl>
        </Section>
        <Section title="Answer">
          <div className="flex flex-col gap-3">
            {quote.status === "SENT" && <p>Waiting for an answer.</p>}
            {quote.status === "ACCEPTED" && <p>Accepted{quote.acceptedNote ? `: ${quote.acceptedNote}` : "."}</p>}
            {quote.status === "DECLINED" && <p>Declined{quote.declineReason ? `: ${quote.declineReason}` : "."}</p>}
            {quote.status === "WITHDRAWN" && <p>Withdrawn.</p>}
            {quote.projectId && (
              <a href={`/jobs/${quote.projectId}`} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
                Open the job
              </a>
            )}
            <Alert variant="error">{action.error}</Alert>
            {quote.status === "SENT" && canAnswer && (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button onClick={() => setAnswering("accept")}>Record acceptance</Button>
                <Button variant="outline" onClick={() => setAnswering("decline")}>
                  Record decline
                </Button>
                <Button variant="ghost" disabled={action.busy} onClick={() => void action.run(async () => (await api(`/quotes/${quote.id}/withdraw`, { body: {} }), reload(), true))}>
                  Withdraw
                </Button>
              </div>
            )}
          </div>
        </Section>
      </Stack>
      {answering && <AnswerSheet quote={quote} kind={answering} onClose={() => setAnswering(null)} onDone={reload} />}
    </>
  );
}
