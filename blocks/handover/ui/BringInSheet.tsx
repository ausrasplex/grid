"use client";

// Bring in from plans and the accepted quote (docs/materials-block.md §2):
// what's new, what changed ("Plans now have 26, the list has 24") and what
// the plans or quote don't have any more, each with a tick. Lines changed
// by hand are listed but never touched.

import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button, Checkbox, FormActions, Sheet, SheetContent, api, useAction } from "@grid/ui";
import { MaterialPicture } from "@grid/block-materials/components";
import { finishLine } from "./shared";

type Source = "PLANS" | "QUOTE";
interface MaterialBit {
  name: string;
  brand: string | null;
  finish: string | null;
  size: string | null;
  photoFileId: string | null;
  swatch: string | null;
}
export interface BringInJson {
  sources: Source[];
  add: { choice: string; source: Source; material: MaterialBit; room: string | null; qty: number; from: string[] }[];
  update: { choice: string; source: Source; material: MaterialBit; room: string | null; was: number | null; now: number; from: string[] }[];
  remove: { choice: string; source: Source; material: MaterialBit; room: string | null; was: number | null }[];
  kept: { id: string; source: Source; material: MaterialBit; room: string | null; was: number | null; now: number }[];
  unlinked: { source: Source; label: string; qty: number }[];
}

const from = (source: Source) => (source === "PLANS" ? "Plans" : "The quote");
const fromLower = (source: Source) => (source === "PLANS" ? "the plans" : "the quote");
export const sourcesLabel = (sources: Source[]) => (sources.length === 2 ? "plans and quote" : sources[0] === "PLANS" ? "plans" : "quote");
const count = (qty: number | null) => (qty === null ? "TBC" : String(qty));

function Row({ material, room, children, choice, ticked, onTick }: { material: MaterialBit; room: string | null; children: ReactNode; choice?: string; ticked?: boolean; onTick?: () => void }) {
  const body = (
    <>
      <MaterialPicture material={material} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{material.name}</span>
        <span className="block text-sm text-muted-foreground">{[finishLine(material), room ?? "General"].filter(Boolean).join(" · ")}</span>
        <span className="block text-sm">{children}</span>
      </span>
    </>
  );
  if (!choice) return <li className="flex items-center gap-3 px-4 py-3">{body}</li>;
  return (
    <li>
      <label className="flex min-h-touch cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted">
        <Checkbox checked={ticked} onCheckedChange={onTick} aria-label={material.name} />
        {body}
      </label>
    </li>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <ul className="divide-y overflow-hidden rounded-xl border">{children}</ul>
    </section>
  );
}

export function BringInSheet({ projectId, sources, onClose, onDone }: { projectId: string; sources: Source[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [plan, setPlan] = useState<BringInJson | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const load = useAction();
  const action = useAction();

  useEffect(() => {
    void load.run(async () => {
      const next = await api<BringInJson>(`/handover/job/${projectId}/bring-in`);
      setPlan(next);
      // New lines and changed counts are ticked; removing is up to you.
      setTicked(new Set([...next.add.map((line) => line.choice), ...next.update.map((line) => line.choice)]));
    });
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tick = (choice: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(choice)) next.delete(choice);
      else next.add(choice);
      return next;
    });
  const nothing = plan && !plan.add.length && !plan.update.length && !plan.remove.length;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title={`Bring in from ${sourcesLabel(sources)}`} description="Icons counted on the plans (per level) and material lines on accepted quotes, by their price list item's material. Lines you've changed by hand are left alone.">
        <div className="flex flex-col gap-5">
          <Alert variant="error">{load.error}</Alert>
          {!plan && !load.error && <p className="text-muted-foreground">Counting…</p>}
          {nothing && <Alert>The list already matches the {sourcesLabel(plan.sources)}.</Alert>}

          {plan && plan.add.length > 0 && (
            <Group title={`New (${plan.add.length})`}>
              {plan.add.map((line) => (
                <Row key={line.choice} material={line.material} room={line.room} choice={line.choice} ticked={ticked.has(line.choice)} onTick={() => tick(line.choice)}>
                  × {line.qty} <span className="text-muted-foreground">from {line.from.join(", ")}</span>
                </Row>
              ))}
            </Group>
          )}
          {plan && plan.update.length > 0 && (
            <Group title={`Changed (${plan.update.length})`}>
              {plan.update.map((line) => (
                <Row key={line.choice} material={line.material} room={line.room} choice={line.choice} ticked={ticked.has(line.choice)} onTick={() => tick(line.choice)}>
                  {from(line.source)} now have {line.now}, the list has {count(line.was)}. Update?
                </Row>
              ))}
            </Group>
          )}
          {plan && plan.remove.length > 0 && (
            <Group title={`Not there any more (${plan.remove.length})`} note="Brought in before, but no longer counted. Tick to take them off the list.">
              {plan.remove.map((line) => (
                <Row key={line.choice} material={line.material} room={line.room} choice={line.choice} ticked={ticked.has(line.choice)} onTick={() => tick(line.choice)}>
                  {count(line.was)} on the list, none on {fromLower(line.source)}
                </Row>
              ))}
            </Group>
          )}
          {plan && plan.kept.length > 0 && (
            <Group title={`Changed by hand, left alone (${plan.kept.length})`}>
              {plan.kept.map((line) => (
                <Row key={line.id} material={line.material} room={line.room}>
                  {count(line.was)} on the list, {line.now || "none"} on {fromLower(line.source)}
                </Row>
              ))}
            </Group>
          )}
          {plan && plan.unlinked.length > 0 && (
            <Group title={`Not linked to a material (${plan.unlinked.length})`} note="Link the icon number to a price list item in a quote's Take-off, and the item to a material in the Price list. Then bring in again.">
              {plan.unlinked.map((row) => (
                <li key={`${row.source}:${row.label}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">{row.label}</span>
                  <span className="shrink-0 text-muted-foreground">× {row.qty}</span>
                </li>
              ))}
            </Group>
          )}

          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={onClose}>
              {nothing ? "Close" : "Cancel"}
            </Button>
            {!nothing && (
              <Button
                size="lg"
                disabled={!plan || !ticked.size || action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await api(`/handover/job/${projectId}/bring-in`, { body: { choices: [...ticked] } });
                    await onDone();
                  })
                }
              >
                {action.busy ? "Bringing in…" : `Bring in ${ticked.size} change${ticked.size === 1 ? "" : "s"}`}
              </Button>
            )}
          </FormActions>
        </div>
      </SheetContent>
    </Sheet>
  );
}
