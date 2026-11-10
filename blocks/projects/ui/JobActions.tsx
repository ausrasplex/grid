"use client";

// Finish / reopen a job, and copy its link (a quick-route code).

import { useState } from "react";
import { Alert, Button, FormActions, Icon, Sheet, SheetContent, api, useAction } from "@grid/ui";

export function FinishJob({ jobId, status, siteName, lastActiveHere }: { jobId: string; status: "ACTIVE" | "COMPLETED"; siteName: string; lastActiveHere: boolean }) {
  const [open, setOpen] = useState(false);
  const action = useAction();
  const set = (next: "ACTIVE" | "COMPLETED") =>
    action.run(async () => {
      await api(`/projects/${jobId}/status`, { body: { status: next } });
      window.location.reload();
      return true;
    });

  if (status === "COMPLETED") {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="outline" size="lg" block disabled={action.busy} onClick={() => set("ACTIVE")}>
          <Icon name="reopen" /> Reopen job
        </Button>
        <Alert variant="error">{action.error}</Alert>
      </div>
    );
  }
  return (
    <>
      <Button variant="outline" size="lg" block onClick={() => setOpen(true)}>
        <Icon name="done" /> Finish job
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          title="Finish this job?"
          description={
            lastActiveHere
              ? `It moves to "Earlier jobs" at ${siteName}, and the site is archived because it's your last active job there. Start a new job at the address and it all comes back.`
              : `It moves to "Earlier jobs" at ${siteName}. You can reopen it any time.`
          }
        >
          <div className="flex flex-col gap-3 px-2 pt-2">
            <Alert variant="error">{action.error}</Alert>
            <FormActions>
              <Button variant="outline" size="lg" onClick={() => setOpen(false)}>Not yet</Button>
              <Button size="lg" disabled={action.busy} onClick={() => set("COMPLETED")}>
                {action.busy ? "Finishing…" : "Finish job"}
              </Button>
            </FormActions>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Copies the job's or site's short link. Links only route; they never grant access. */
export function CopyLink({ codePath, label = "Copy link" }: { codePath: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const action = useAction();
  return (
    <Button
      variant="outline"
      aria-label={label}
      title={label}
      className="size-touch px-0 sm:w-auto sm:px-4"
      disabled={action.busy}
      onClick={() =>
        action.run(async () => {
          const code = await api<string>(codePath);
          const url = `${window.location.origin}/go/${code}`;
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            window.prompt("Copy this link", url);
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          return true;
        })
      }
    >
      <Icon name={copied ? "check" : "link"} />
      <span className="hidden sm:inline">{copied ? "Copied" : label}</span>
    </Button>
  );
}
