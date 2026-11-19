"use client";

// Delete Job (docs/stage-2-projects.md "Deleting a job"): only on an
// archived job, for Owners. Highly destructive, so it takes several steps:
//   1. a separate "Delete this job" section, away from the everyday buttons
//   2. a first box listing everything that goes and what stays
//   3. a second box: type the job number (or name) exactly, and tick
//      "I understand"; then a short wait before the button works
//   4. it goes to Recently deleted first (Jobs › Recently deleted puts it
//      back); the nightly clean-up removes it for good only after that
// The server checks all of it again.
// Also: the Jobs page's Recently deleted list, with Put back.

import { useEffect, useState } from "react";
import { RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { Alert, Button, Field, FormActions, List, Section, Sheet, SheetContent, api, formatBytes, useAction } from "@grid/ui";

interface StorageLineJson {
  key: string;
  count: number;
  one: string;
  many: string;
  originalBytes: number;
  copyBytes: number;
  deletedBytes: number;
}

const day = (date: string | Date) => new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
/** Seconds the final button waits once everything's filled in: no reflex taps. */
const WAIT = 3;

export function DeleteJob({ jobId, jobName, jobNumber, lines, deletedDays }: { jobId: string; jobName: string; jobNumber: string | null; lines: StorageLineJson[]; deletedDays: number }) {
  const [step, setStep] = useState<"what" | "confirm" | null>(null);
  const [typed, setTyped] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [wait, setWait] = useState(WAIT);
  const action = useAction();
  const word = jobNumber || jobName;
  const matches = typed.trim().replace(/\s+/g, " ").toLowerCase() === word.trim().replace(/\s+/g, " ").toLowerCase();
  const ready = matches && understood;

  // The countdown starts again whenever the confirmation changes.
  useEffect(() => {
    if (!ready) return setWait(WAIT);
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [ready, wait]);

  const close = () => {
    setStep(null);
    setTyped("");
    setUnderstood(false);
  };
  const shown = lines.filter((line) => line.count > 0);
  const bytes = lines.reduce((total, line) => total + line.originalBytes + line.copyBytes + line.deletedBytes, 0);

  return (
    <Section title="Delete this job" description="For good, with everything in it. Only for archived jobs you'll never need again.">
      <Button variant="outline" size="lg" block className="border-destructive/60 text-destructive hover:bg-destructive/10" onClick={() => setStep("what")}>
        <Trash2 /> Delete job…
      </Button>

      <Sheet open={step === "what"} onOpenChange={(open) => !open && close()}>
        <SheetContent desktop="dialog" title={`Delete ${jobNumber ? `${jobNumber} ` : ""}${jobName}?`} description="Read what goes first.">
          <div className="flex flex-col gap-3 px-2 pt-2">
            <div className="flex gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <TriangleAlert className="size-5 shrink-0 text-destructive" />
              <div className="flex flex-col gap-2">
                <p className="font-semibold">Everything in this job will be deleted for good:</p>
                <ul className="list-disc pl-5">
                  {shown.map((line) => (
                    <li key={line.key}>
                      {line.count} {line.count === 1 ? line.one : line.many}
                    </li>
                  ))}
                  <li>every markup, icon, measurement, note and sign-off on them</li>
                </ul>
                {bytes > 0 && <p>About {formatBytes(bytes)} of files.</p>}
              </div>
            </div>
            <p className="text-sm">
              <strong>What stays:</strong> its quotes (no longer linked to a job), the client, the site, and the activity log.
            </p>
            <p className="text-sm">
              <strong>Recently deleted first:</strong> it disappears straight away, but an Owner can put it back from <em>Jobs › Recently deleted</em> for {deletedDays} days. After that it&apos;s removed for good and <strong>can&apos;t be undone</strong>, even from a backup made after then.
            </p>
            <FormActions>
              <Button variant="outline" size="lg" onClick={close}>
                Keep the job
              </Button>
              <Button variant="outline" size="lg" className="border-destructive/60 text-destructive" onClick={() => setStep("confirm")}>
                Continue
              </Button>
            </FormActions>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={step === "confirm"} onOpenChange={(open) => !open && close()}>
        <SheetContent desktop="dialog" title="Are you sure?" description={`Type ${word} to delete this job.`}>
          <form
            className="flex flex-col gap-3 px-2 pt-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!ready || wait > 0) return;
              void action.run(async () => {
                await api(`/projects/${jobId}/delete`, { body: { confirm: typed } });
                window.location.href = "/jobs#recently-deleted";
              });
            }}
          >
            <Field label={`Type ${word}`} value={typed} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(event) => setTyped(event.target.value)} autoFocus />
            <label className="flex min-h-touch items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} />
              <span>I understand this job&apos;s photos, plans, documents and notes are deleted for good after {deletedDays} days.</span>
            </label>
            <Alert variant="error">{action.error}</Alert>
            <FormActions>
              <Button type="button" variant="outline" size="lg" onClick={close}>
                Keep the job
              </Button>
              <Button type="submit" size="lg" variant="destructive" disabled={!ready || wait > 0 || action.busy}>
                <Trash2 /> {action.busy ? "Deleting…" : ready && wait > 0 ? `Delete job (${wait})` : "Delete job"}
              </Button>
            </FormActions>
          </form>
        </SheetContent>
      </Sheet>
    </Section>
  );
}

export interface DeletedJobJson {
  id: string;
  name: string;
  jobNumber: string | null;
  clientName: string | null;
  deletedAt: string;
  goneForGoodAfter: string;
}

/** Jobs › Recently deleted: put a deleted job back before it goes for good. */
export function DeletedJobs({ initial }: { initial: DeletedJobJson[] }) {
  const [rows, setRows] = useState(initial);
  const action = useAction();
  if (!rows.length) return null;
  return (
    <div id="recently-deleted">
      <Section title="Recently deleted" description="Deleted jobs, kept until the date shown, then removed for good by the nightly clean-up. Put one back to make it an archived job again." flush>
        <List>
          {rows.map((row) => (
            <li key={row.id} className="flex min-h-touch-lg items-center gap-3 px-4 py-2 sm:px-6">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{[row.jobNumber, row.name].filter(Boolean).join(" ")}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {[row.clientName, `deleted ${day(row.deletedAt)}`, `gone for good after ${day(row.goneForGoodAfter)}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <Button
                variant="outline"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await api(`/projects/${row.id}/undelete`, { body: {} });
                    setRows((current) => current.filter((entry) => entry.id !== row.id));
                  })
                }
              >
                <RotateCcw /> Put back
              </Button>
            </li>
          ))}
        </List>
        <div className="px-4 pb-2 sm:px-6">
          <Alert variant="error">{action.error}</Alert>
        </div>
      </Section>
    </div>
  );
}
