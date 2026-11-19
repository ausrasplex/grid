"use client";

// A quote's Take-off section (phase 4c part 2, docs/quotations-block.md
// "Take-off from plans"), drawn by Markups in the quote editor's
// "quote.takeoff" slot:
//   - no job yet: Start a take-off makes a Quoting job and opens its plans
//   - the job's icon counts (whole job), split by number, each with the
//     price book item it becomes (Pick an item)
//   - Add to quote turns counts into lines; when the plans change, "Take-off
//     changed" lists the differences to update or keep

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileStack, Loader2 } from "lucide-react";
import { Alert, Badge, Button, Section, api, useAction, useQuoteTakeoff, type TakeoffLine } from "@grid/ui";
import { iconLookup, type CustomIconRow } from "../icons";
import { IconGlyph } from "./IconGlyph";
import type { JobIconsJson } from "./IconLayer";

interface Row {
  takeoffKey: string;
  iconKey: string;
  number: number;
  label: string;
  count: number;
  priceItemId: string | null;
}

export function QuoteTakeoff({ initial, canEditIcons, customIcons }: { initial: JobIconsJson | null; canEditIcons: boolean; customIcons: CustomIconRow[] }) {
  const takeoff = useQuoteTakeoff();
  const lookup = useMemo(() => iconLookup(customIcons), [customIcons]);
  const [job, setJob] = useState(initial);
  const [names, setNames] = useState<Record<string, string>>({});
  const [kept, setKept] = useState(false);
  const action = useAction();

  const reload = useCallback(async () => {
    if (!takeoff.projectId) return;
    setJob(await api<JobIconsJson>(`/markups/job/${takeoff.projectId}/icons`));
  }, [takeoff.projectId]);
  // Counts change on the plans: check again when coming back to this tab.
  useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && void reload().catch(() => {});
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [reload]);

  const rows = useMemo<Row[]>(() => {
    if (!job) return [];
    const totals = new Map<string, Row>();
    for (const entry of job.counts) {
      const takeoffKey = `${entry.iconKey}#${entry.number}`;
      const versions = job.versions.filter((version) => version.iconKey === entry.iconKey);
      const version = versions.find((candidate) => candidate.number === entry.number);
      const row = totals.get(takeoffKey) ?? {
        takeoffKey,
        iconKey: entry.iconKey,
        number: entry.number,
        label: lookup.label(entry.iconKey, entry.number, version?.name, versions.length >= 2),
        count: 0,
        priceItemId: version?.priceItemId ?? null,
      };
      row.count += entry.count;
      totals.set(takeoffKey, row);
    }
    return [...totals.values()].sort((first, second) => first.label.localeCompare(second.label, "en-AU", { numeric: true }));
  }, [job, lookup]);

  // What each linked item is called.
  const linked = rows.flatMap((row) => (row.priceItemId ? [row.priceItemId] : []));
  const linkedKey = [...new Set(linked)].sort().join(",");
  useEffect(() => {
    if (!linkedKey) return;
    void takeoff.itemNames(linkedKey.split(",")).then(setNames).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedKey]);

  if (!takeoff.projectId) {
    return (
      <Section title="Take-off" description="Count icons off the plans and turn them into lines. A quote that isn't for a job yet gets a Quoting job to hold its plans; it becomes the job when the quote is accepted.">
        {takeoff.editable ? (
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="lg"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  const projectId = await takeoff.start();
                  window.location.href = `/plans/job/${projectId}`;
                })
              }
            >
              <FileStack /> {action.busy ? "Getting the job ready…" : "Start a take-off"}
            </Button>
            <Alert variant="error">{action.error}</Alert>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No take-off on this quote.</p>
        )}
      </Section>
    );
  }

  const changed = rows.filter((row) => takeoff.onQuote[row.takeoffKey] !== undefined && takeoff.onQuote[row.takeoffKey] !== row.count);
  const gone = Object.keys(takeoff.onQuote).filter((key) => !rows.some((row) => row.takeoffKey === key) && takeoff.onQuote[key]! > 0);
  const toAdd = rows.filter((row) => row.priceItemId && takeoff.onQuote[row.takeoffKey] === undefined && row.count > 0);
  const lineFor = (row: Row): TakeoffLine => ({ takeoffKey: row.takeoffKey, qty: row.count, priceItemId: row.priceItemId! });

  return (
    <Section
      title="Take-off"
      description="Icons placed on this job's plans (every sheet), split by number."
      actions={
        <Button variant="outline" size="sm" asChild>
          <a href={`/plans/job/${takeoff.projectId}`}>
            <FileStack /> Plans
          </a>
        </Button>
      }
      flush
    >
      {!job ? (
        <p className="flex items-center gap-2 px-4 pb-4 text-sm text-muted-foreground sm:px-6">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      ) : (
        <>
          {takeoff.editable && !kept && (changed.length > 0 || gone.length > 0) && (
            <div className="mx-4 mb-3 flex flex-col gap-2 rounded-lg border border-warning/50 bg-warning/15 p-3 text-sm sm:mx-6">
              <p className="font-semibold">Take-off changed</p>
              <ul className="flex flex-col gap-0.5">
                {changed.map((row) => (
                  <li key={row.takeoffKey}>
                    {row.label}: {takeoff.onQuote[row.takeoffKey]} on the quote, {row.count} on the plans
                  </li>
                ))}
                {gone.map((key) => (
                  <li key={key}>
                    {lookup.label(key.split("#")[0]!, Number(key.split("#")[1]))}: {takeoff.onQuote[key]} on the quote, none on the plans now
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await takeoff.addLines([
                        ...changed.filter((row) => row.priceItemId).map(lineFor),
                        // Gone from the plans: the line stays, at 0, so you decide whether to delete it.
                        ...gone.flatMap((key) => {
                          const row = job.versions.find((version) => `${version.iconKey}#${version.number}` === key);
                          return row?.priceItemId ? [{ takeoffKey: key, qty: 0, priceItemId: row.priceItemId }] : [];
                        }),
                      ]);
                    })
                  }
                >
                  Update the quote
                </Button>
                <Button size="sm" variant="outline" onClick={() => setKept(true)}>
                  Keep the quote as it is
                </Button>
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-6">No icons on the plans yet. Open Plans, upload drawings, and place icons from Icons in the tool bar.</p>
          ) : (
            <ul className="divide-y border-t">
              {rows.map((row) => {
                const icon = lookup.icon(row.iconKey);
                const trade = lookup.trade(row.iconKey);
                const onQuote = takeoff.onQuote[row.takeoffKey];
                return (
                  <li key={row.takeoffKey} className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
                    {icon && trade && (
                      <span className="paper flex size-9 shrink-0 items-center justify-center rounded bg-white">
                        <IconGlyph icon={icon} colour={trade.colour} className="size-7" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {row.label} <span className="tabular-nums">× {row.count}</span>
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">{row.priceItemId ? (names[row.priceItemId] ?? "Linked item") : "No price book item yet"}</span>
                    </span>
                    {onQuote !== undefined && onQuote === row.count && <Badge variant="success">On the quote</Badge>}
                    {takeoff.editable && canEditIcons && (
                      <Button
                        variant={row.priceItemId ? "ghost" : "outline"}
                        size="sm"
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(async () => {
                            const item = await takeoff.chooseItem();
                            if (!item) return;
                            setJob(await api<JobIconsJson>(`/markups/job/${takeoff.projectId}/icon-item`, { method: "PUT", body: { iconKey: row.iconKey, number: row.number, priceItemId: item.id } }));
                            setNames((current) => ({ ...current, [item.id]: item.name }));
                          })
                        }
                      >
                        {row.priceItemId ? "Change" : "Pick an item"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {takeoff.editable && (
            <div className="flex flex-col gap-2 border-t px-4 py-3 sm:px-6">
              <Button disabled={action.busy || !toAdd.length} onClick={() => void action.run(() => takeoff.addLines(toAdd.map(lineFor)))}>
                {toAdd.length ? `Add ${toAdd.length} to the quote` : "Everything with an item is on the quote"}
              </Button>
              {rows.some((row) => !row.priceItemId) && <p className="text-xs text-muted-foreground">Icons without a price book item can&apos;t be added until you pick one.</p>}
              <Alert variant="error">{action.error}</Alert>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
