"use client";

// Part 5's small client pieces (docs/assets-block.md "What part 5 built"):
//   ScanSeen      on the asset page: opened by a scan (?scanned=1), it counts as seen.
//   StillGotItRow a "Do you still have it?" row in Needs attention: Yes / No.
//   Reminders     Settings › Asset categories: Not seen and "still got it?" days.
import { useEffect, useState } from "react";
import { Alert, Button, Field, Section, api, useAction } from "@grid/ui";

/** Strips one search parameter from the address bar without reloading. */
export function dropParam(name: string) {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function ScanSeen({ assetId }: { assetId: string }) {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("scanned") !== "1") return;
    // Take it out first, so a refresh or a shared link doesn't count again.
    dropParam("scanned");
    void api(`/assets/${assetId}/seen`, { method: "POST" }).catch(() => {});
  }, [assetId]);
  return null;
}

export function StillGotItRow({ assetId, title, where, howLong }: { assetId: string; title: string; where: string; howLong: string }) {
  const [answered, setAnswered] = useState(false);
  const action = useAction();
  if (answered) return null;
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
      <a href={`/assets/${assetId}`} className="min-w-0 flex-1 hover:underline">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Do you still have {title}?</span>
          <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-foreground">Still got it?</span>
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">
          {where}. Not seen for {howLong}.
        </span>
        {action.error && <span className="mt-1 block text-sm font-semibold text-destructive">{action.error}</span>}
      </a>
      <div className="flex shrink-0 gap-2">
        <Button
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              await api(`/assets/${assetId}/seen`, { method: "POST" });
              setAnswered(true);
            })
          }
        >
          Yes
        </Button>
        <Button asChild variant="outline">
          <a href={`/assets/${assetId}?report=lost`}>No</a>
        </Button>
      </div>
    </li>
  );
}

export function Reminders({ initial }: { initial: { notSeenDays: number; stillGotItDays: number } }) {
  const [notSeenDays, setNotSeenDays] = useState(String(initial.notSeenDays));
  const [stillGotItDays, setStillGotItDays] = useState(String(initial.stillGotItDays));
  const [saved, setSaved] = useState(initial);
  const action = useAction();
  const changed = notSeenDays !== String(saved.notSeenDays) || stillGotItDays !== String(saved.stillGotItDays);
  return (
    <Section title="Reminders" description="When Grid points out gear that hasn't been seen. Every move and every scan of its tag counts as seeing it.">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            const next = await api<{ notSeenDays: number; stillGotItDays: number }>("/assets/settings/reminders", { method: "PUT", body: { notSeenDays, stillGotItDays } });
            setSaved(next);
            setNotSeenDays(String(next.notSeenDays));
            setStillGotItDays(String(next.stillGotItDays));
          });
        }}
      >
        <Field
          label="Not seen after (days)"
          hint="Shows Not seen on the list and in Needs attention, and emails Owners and Foremen once."
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          value={notSeenDays}
          onChange={(event) => setNotSeenDays(event.target.value)}
        />
        <Field
          label={'Ask "Do you still have it?" after (days)'}
          hint="For gear with someone, or left on a job. Home asks whoever has it (or left it); Yes counts as seeing it, No reports it lost."
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          value={stillGotItDays}
          onChange={(event) => setStillGotItDays(event.target.value)}
        />
        <Alert variant="error">{action.error}</Alert>
        <div>
          <Button type="submit" disabled={!changed || action.busy}>
            {action.busy ? "Saving…" : "Save reminders"}
          </Button>
        </div>
      </form>
    </Section>
  );
}
