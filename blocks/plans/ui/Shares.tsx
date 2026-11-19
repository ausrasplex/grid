"use client";

// Share links on a job's Plans page (docs/plans-block.md "Sharing plans"):
// make a private link to chosen sheets for someone without Grid, pick the
// layers whose markups and icons go with it, how long it works and whether
// it can be downloaded; then copy it, see when it was last opened, or turn
// it off.

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import { Alert, Badge, Button, Field, FormActions, Segmented, Sheet, SheetContent, api, cn, useAction } from "@grid/ui";

export interface ShareJson {
  id: string;
  name: string;
  link: string;
  sheets: { id: string; number: string }[];
  layers: string[];
  allowDownload: boolean;
  expiresAt: string | null;
  state: "on" | "expired" | "off";
  createdBy: string;
  createdAt: string;
  lastOpenedAt: string | null;
  openCount: number;
}

interface LayerRow {
  id: string;
  sheetId: string;
  name: string;
}

const day = (date: string) => new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const fullLink = (link: string) => `${window.location.origin}${link}`;
const DAYS = { "7": 7, "30": 30, "90": 90, never: null } as const;

function CopyButton({ link, label = "Copy link" }: { link: string; label?: string }) {
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
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : label}
    </Button>
  );
}

/** The Share button (for the page header) and the job's links. */
export function PlanShares({ projectId, sheets }: { projectId: string; sheets: { id: string; number: string; title: string }[] }) {
  const [shares, setShares] = useState<ShareJson[] | null>(null);
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const action = useAction();
  const reload = async () => setShares(await api<ShareJson[]>(`/plans/job/${projectId}/shares`));
  useEffect(() => void reload().catch(() => setShares([])), [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = shares?.filter((share) => share.state === "on") ?? [];
  const old = shares?.filter((share) => share.state !== "on") ?? [];

  return (
    <section className="flex flex-col gap-3" aria-label="Share links">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Share links</h2>
          <p className="text-sm text-muted-foreground">A private link to some sheets, for someone without Grid: a builder, client or supplier.</p>
        </div>
        <Button variant="outline" size="lg" disabled={!sheets.length} onClick={() => setMaking(true)}>
          <Share2 /> Share plans
        </Button>
      </div>

      {live.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl bg-card">
          {live.map((share) => (
            <ShareRow key={share.id} share={share} busy={action.busy} onOff={() => {
              if (!window.confirm(`Turn off the link for ${share.name}? Anyone with it won't be able to open it. You can make a new one any time.`)) return;
              void action.run(async () => (await api(`/plans/shares/${share.id}`, { method: "DELETE" }), await reload()));
            }} />
          ))}
        </ul>
      )}
      {old.length > 0 && (
        <details className="rounded-xl bg-card">
          <summary className="flex min-h-touch cursor-pointer items-center px-4 text-sm text-muted-foreground">Turned off and run out ({old.length})</summary>
          <ul className="divide-y border-t">
            {old.map((share) => (
              <ShareRow key={share.id} share={share} busy />
            ))}
          </ul>
        </details>
      )}
      <Alert variant="error">{action.error}</Alert>

      <Sheet open={making} onOpenChange={(open) => !open && (setMaking(false), setMade(null))}>
        <SheetContent title={made ? "Link ready" : "Share plans"} description={made ? "Send it by text or email. Anyone with the link can see these sheets." : "Pick the sheets and the layers that go with them."}>
          {made ? (
            <div className="flex flex-col gap-3">
              <p className="break-all rounded-lg bg-muted p-3 font-mono text-sm">{fullLink(made)}</p>
              <FormActions>
                <Button variant="outline" onClick={() => (setMaking(false), setMade(null))}>
                  Done
                </Button>
                <CopyButton link={made} />
              </FormActions>
            </div>
          ) : (
            <ShareForm
              projectId={projectId}
              sheets={sheets}
              onMade={async (link) => {
                setMade(link);
                await reload();
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function ShareRow({ share, busy, onOff }: { share: ShareJson; busy: boolean; onOff?: () => void }) {
  const sheetWords = share.sheets.length === 1 ? share.sheets[0]!.number : `${share.sheets.length} sheets`;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <Link2 className="size-4 shrink-0 text-primary" />
          <span className="truncate">{share.name}</span>
          {share.state === "off" && <Badge variant="outline">Turned off</Badge>}
          {share.state === "expired" && <Badge variant="outline">Run out</Badge>}
        </p>
        <p className="text-sm text-muted-foreground">
          {[
            sheetWords,
            share.layers.length ? share.layers.join(", ") : "No markups",
            share.allowDownload ? "can download" : "view only",
            share.state === "on" ? (share.expiresAt ? `until ${day(share.expiresAt)}` : "no end date") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-xs text-muted-foreground">
          {share.lastOpenedAt ? `Opened ${share.openCount} time${share.openCount === 1 ? "" : "s"}, last ${day(share.lastOpenedAt)}` : "Not opened yet"} · by {share.createdBy}, {day(share.createdAt)}
        </p>
      </div>
      {onOff && (
        <div className="flex shrink-0 gap-2">
          <CopyButton link={share.link} label="Copy" />
          <Button variant="ghost" className="text-destructive" disabled={busy} onClick={onOff}>
            Turn off
          </Button>
        </div>
      )}
    </li>
  );
}

function ShareForm({ projectId, sheets, onMade }: { projectId: string; sheets: { id: string; number: string; title: string }[]; onMade: (link: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(sheets.map((sheet) => sheet.id)));
  const [layers, setLayers] = useState<LayerRow[]>([]);
  // Layers are per sheet, so they're picked by name across the chosen sheets.
  const [offNames, setOffNames] = useState<Set<string>>(new Set());
  const [withDefault, setWithDefault] = useState(true);
  const [allowDownload, setAllowDownload] = useState(true);
  const [days, setDays] = useState<keyof typeof DAYS>("30");
  const action = useAction();

  useEffect(() => void api<LayerRow[]>(`/plans/job/${projectId}/layers`).then(setLayers).catch(() => {}), [projectId]);
  const names = useMemo(() => [...new Set(layers.filter((layer) => chosen.has(layer.sheetId)).map((layer) => layer.name))].sort((first, second) => first.localeCompare(second)), [layers, chosen]);
  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };
  const tick = "mt-0.5 size-5 shrink-0 accent-primary";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          const result = await api<{ link: string }>(`/plans/job/${projectId}/shares`, {
            body: {
              name,
              // Set order, as on the Plans page.
              sheetIds: sheets.filter((sheet) => chosen.has(sheet.id)).map((sheet) => sheet.id),
              layerIds: layers.filter((layer) => chosen.has(layer.sheetId) && !offNames.has(layer.name)).map((layer) => layer.id),
              withDefault,
              allowDownload,
              days: DAYS[days],
            },
          });
          await onMade(result.link);
        });
      }}
    >
      <Field label="Who's it for?" placeholder="Smith Builders site office" value={name} onChange={(event) => setName(event.target.value)} required autoFocus />

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium">
          <span>
            Sheets ({chosen.size} of {sheets.length})
          </span>
          <button type="button" className="min-h-touch px-2 text-sm text-primary" onClick={() => setChosen(chosen.size === sheets.length ? new Set() : new Set(sheets.map((sheet) => sheet.id)))}>
            {chosen.size === sheets.length ? "None" : "All"}
          </button>
        </legend>
        <ul className="max-h-64 overflow-y-auto rounded-lg border">
          {sheets.map((sheet) => (
            <li key={sheet.id}>
              <label className="flex min-h-touch items-start gap-3 px-3 py-2 text-sm">
                <input type="checkbox" className={tick} checked={chosen.has(sheet.id)} onChange={() => setChosen(toggle(chosen, sheet.id))} />
                <span className="min-w-0">
                  <span className="font-semibold">{sheet.number}</span> <span className="text-muted-foreground">{sheet.title}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Markups and icons on these layers</legend>
        <label className="flex min-h-touch items-start gap-3 text-sm">
          <input type="checkbox" className={tick} checked={withDefault} onChange={() => setWithDefault(!withDefault)} />
          <span>Default</span>
        </label>
        {names.map((layerName) => (
          <label key={layerName} className="flex min-h-touch items-start gap-3 text-sm">
            <input type="checkbox" className={tick} checked={!offNames.has(layerName)} onChange={() => setOffNames(toggle(offNames, layerName))} />
            <span>{layerName}</span>
          </label>
        ))}
        <p className="text-xs text-muted-foreground">Untick them all for the clean drawing. &quot;Just me&quot; markups and photo pins never go on a link.</p>
      </fieldset>

      <Segmented
        label="Works for"
        value={days}
        onChange={setDays}
        items={[
          { value: "7", label: "7 days" },
          { value: "30", label: "30 days" },
          { value: "90", label: "90 days" },
          { value: "never", label: "No end" },
        ]}
      />

      <label className="flex min-h-touch items-start gap-3 text-sm">
        <input type="checkbox" className={tick} checked={allowDownload} onChange={() => setAllowDownload(!allowDownload)} />
        <span>
          Can download a PDF
          <span className="block text-xs text-muted-foreground">The original drawings with these layers drawn on.</span>
        </span>
      </label>

      <p className={cn("text-xs text-muted-foreground")}>The link always shows each sheet&apos;s current revision, so new revisions reach them without a new link.</p>
      <Alert variant="error">{action.error}</Alert>
      <FormActions>
        <Button type="submit" size="lg" disabled={action.busy || !chosen.size || !name.trim()}>
          <Link2 /> {action.busy ? "Making the link…" : "Make the link"}
        </Button>
      </FormActions>
    </form>
  );
}
