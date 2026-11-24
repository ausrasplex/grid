"use client";

// The client's link on the job's Handover page (docs/materials-block.md
// "The client's link"): make it, copy it for a text, email it with the PDF
// attached, see when it was last opened, or turn it off.

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Mail } from "lucide-react";
import { Alert, Button, Field, FormActions, Segmented, Sheet, SheetContent, api, useAction } from "@grid/ui";
import { day, type ShareJson } from "./shared";

const fullLink = (link: string) => `${window.location.origin}${link}`;
const DAYS = { never: null, "30": 30, "90": 90, "365": 365 } as const;

function CopyButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(fullLink(link)).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

export function ShareCard({ projectId, hasClient }: { projectId: string; hasClient: boolean }) {
  const [share, setShare] = useState<ShareJson | null | undefined>(undefined);
  const [days, setDays] = useState<keyof typeof DAYS>("never");
  const [emailing, setEmailing] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const action = useAction();
  const reload = async () => setShare(await api<ShareJson | null>(`/handover/job/${projectId}/share`));
  useEffect(() => void reload().catch(() => setShare(null)), [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (share === undefined) return null;
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-4 sm:p-5" aria-label="The client's link">
      <div className="flex items-start gap-3">
        <Link2 className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">The client&apos;s link</h2>
          {share ? (
            <p className="text-sm text-muted-foreground">
              {[share.expiresAt ? `Works until ${day(share.expiresAt)}` : "No end date", share.lastOpenedAt ? `opened ${share.openCount} time${share.openCount === 1 ? "" : "s"}, last ${day(share.lastOpenedAt)}` : "not opened yet"].join(" · ")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">The client opens the list and downloads the PDF any time, without Grid. It always shows the current list.</p>
          )}
        </div>
      </div>
      {share ? (
        <>
          <p className="break-all rounded-lg bg-muted p-3 font-mono text-sm">{fullLink(share.link)}</p>
          {sent && <Alert>Sent to {sent}.</Alert>}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <CopyButton link={share.link} />
            <Button variant="outline" onClick={() => (setSent(null), setEmailing(true))}>
              <Mail /> Email to client
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={action.busy}
              onClick={() => {
                if (!window.confirm("Turn off the client's link? It stops working straight away. You can make a new one any time.")) return;
                void action.run(async () => (await api(`/handover/shares/${share.id}`, { method: "DELETE" }), await reload()));
              }}
            >
              Turn off
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <Segmented
            label="Works for"
            value={days}
            onChange={setDays}
            items={[
              { value: "never", label: "No end" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
              { value: "365", label: "1 year" },
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button disabled={action.busy} onClick={() => void action.run(async () => setShare(await api<ShareJson>(`/handover/job/${projectId}/share`, { body: { days: DAYS[days] } })))}>
              <Link2 /> Make the link
            </Button>
            <Button variant="outline" onClick={() => (setSent(null), setEmailing(true))}>
              <Mail /> Email to client
            </Button>
          </div>
        </div>
      )}
      <Alert variant="error">{action.error}</Alert>
      {emailing && (
        <EmailSheet
          projectId={projectId}
          hasClient={hasClient}
          onClose={() => setEmailing(false)}
          onSent={async (to) => {
            setEmailing(false);
            setSent(to);
            await reload();
          }}
        />
      )}
    </section>
  );
}

function EmailSheet({ projectId, hasClient, onClose, onSent }: { projectId: string; hasClient: boolean; onClose: () => void; onSent: (to: string) => Promise<void> }) {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const action = useAction();
  useEffect(() => {
    if (!hasClient) return;
    void api<{ email: string | null }>(`/handover/job/${projectId}/client-email`)
      .then((client) => client.email && setTo((current) => current || client.email!))
      .catch(() => {});
  }, [projectId, hasClient]);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title="Email to client" description="Sends the link, with the PDF attached. Makes the link first if there isn't one (no end date).">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api(`/handover/job/${projectId}/email`, { body: { to, message: message.trim() || undefined } });
              await onSent(to);
            });
          }}
        >
          <Field label="To" type="email" inputMode="email" autoComplete="email" value={to} onChange={(event) => setTo(event.target.value)} required autoFocus={!to} />
          <div className="flex flex-col gap-2 lg:max-w-2xl">
            <label htmlFor="handover-message" className="text-sm font-medium">
              Message (optional)
            </label>
            <textarea
              id="handover-message"
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Here's the handover sheet for your new home: what's installed, room by room."
              className="rounded-lg border border-input bg-card px-3 py-2 text-base"
            />
          </div>
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={action.busy || !to}>
              <Mail /> {action.busy ? "Sending…" : "Send"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}
