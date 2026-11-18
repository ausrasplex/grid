"use client";

// The job page's Storage section: what each Block keeps on disk for this
// job. Originals can't be made again; viewing copies (thumbnails, plan
// tiles, page pictures) can. docs/stage-2-projects.md "Job storage".

import { Section, formatBytes } from "@grid/ui";
import type { JobStorage as JobStorageData } from "../storage";

export function JobStorage({ storage }: { storage: JobStorageData }) {
  const { lines, totals } = storage;
  const shown = lines.filter((line) => line.count > 0 || line.originalBytes + line.copyBytes + line.deletedBytes > 0);
  const total = totals.originalBytes + totals.copyBytes;
  return (
    <Section title="Storage" description={shown.length ? `${formatBytes(total)} on this server` : undefined} flush>
      {shown.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-6">Nothing stored for this job yet.</p>
      ) : (
        <>
          <dl className="divide-y">
            {shown.map((line) => (
              <div key={line.key} className="flex min-h-touch items-center justify-between gap-3 px-4 py-2 sm:px-6">
                <dt className="min-w-0">
                  <span className="block font-semibold">{line.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {line.count} {line.count === 1 ? line.one : line.many}
                  </span>
                </dt>
                <dd className="shrink-0 text-right tabular-nums">
                  <span className="block font-semibold">{formatBytes(line.originalBytes + line.copyBytes)}</span>
                  {line.copyBytes > 0 && <span className="block text-xs text-muted-foreground">{formatBytes(line.copyBytes)} viewing copies</span>}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-1 border-t px-4 py-3 text-xs text-muted-foreground sm:px-6">
            <p>
              {formatBytes(totals.originalBytes)} uploaded, {formatBytes(totals.copyBytes)} of viewing copies. Grid can make the copies again from the originals.
            </p>
            {totals.deletedBytes > 0 && <p>Plus {formatBytes(totals.deletedBytes)} in Recently deleted, freed up when it runs out.</p>}
            {totals.unmeasured > 0 && (
              <p>
                {totals.unmeasured} older {totals.unmeasured === 1 ? "copy isn't" : "copies aren't"} measured yet. Grid measures them overnight.
              </p>
            )}
          </div>
        </>
      )}
    </Section>
  );
}
