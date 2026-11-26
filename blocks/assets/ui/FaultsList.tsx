"use client";

// Faults (/assets/faults, docs/assets-block.md §3): every open fault in
// the business, Do not use first, then oldest first. Tap one to open its
// asset and move the fault along there.
import { Badge, EmptyState, List, PageHeader, Section } from "@grid/ui";
import { STEP_WORDS, TYPE_WORDS } from "./FaultCard";
import { AssetPicture, when } from "./shared";

interface OpenFaultJson {
  id: string;
  asset: { id: string; number: number; name: string; photoFileIds: string[] };
  type: string;
  doNotUse: boolean;
  status: string;
  note: string | null;
  placeName: string | null;
  reportedBy: string;
  reportedAt: string;
}

export function FaultsList({ initial }: { initial: OpenFaultJson[] }) {
  const unsafe = initial.filter((fault) => fault.doNotUse).length;
  return (
    <>
      <PageHeader title="Faults" meta={[`${initial.length} open`, unsafe ? `${unsafe} Do not use` : null].filter(Boolean).join(" · ")} subtitle="Faults reported on your gear that aren't fixed yet." />
      <Section flush>
        {initial.length === 0 ? (
          <EmptyState title="No open faults">When someone reports a fault on an asset, it shows here until it&apos;s fixed.</EmptyState>
        ) : (
          <List>
            {initial.map((fault) => (
              <li key={fault.id}>
                <a href={`/assets/${fault.asset.id}`} className="flex min-h-touch-lg items-start gap-3 px-4 py-3 hover:bg-muted active:bg-muted sm:px-5">
                  <AssetPicture asset={fault.asset} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        No. {fault.asset.number}, {fault.asset.name}
                      </span>
                      {fault.doNotUse && <Badge variant="destructive">Do not use</Badge>}
                    </span>
                    <span className="block text-sm">
                      {TYPE_WORDS[fault.type] ?? "Fault"} · {STEP_WORDS[fault.status]}
                      {fault.note ? ` · ${fault.note}` : ""}
                    </span>
                    <span className="block text-sm text-muted-foreground">{[`${fault.reportedBy}, ${when(fault.reportedAt)}`, fault.placeName].filter(Boolean).join(" · ")}</span>
                  </span>
                </a>
              </li>
            ))}
          </List>
        )}
      </Section>
    </>
  );
}
