"use client";

// A placed icon's own checklist (docs/plans-block.md "Checklists and photos
// on icons"). Tapping an icon on the plan opens Markups' panel for it; this
// adds the icon's checklist to that panel, and colours the ring around each
// icon by how much of its list is done. The "What's left" button beside the
// zoom buttons lists this sheet's icons with something still to do; tapping
// one takes you to it and opens its panel.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ListChecks, Loader2, LocateFixed, X } from "lucide-react";
import { Alert, PlanMarkupSection, PlanSideButton, Scroller, api, usePlanOverlay, type MarkupProgress } from "@grid/ui";
import type { ChecklistItemJson, IconProgressJson } from "../service";
import { ChecklistList } from "./Checklist";

export function IconChecklist({
  initialProgress,
  canTick,
  canManage,
  archived,
}: {
  /** Every icon with a checklist on this sheet, and how far along it is. */
  initialProgress: IconProgressJson[];
  canTick: boolean;
  canManage: boolean;
  /** An archived job's lists are kept as they were. */
  archived: boolean;
}) {
  const { selectedMarkup, setMarkupProgress, markupProgress } = usePlanOverlay();
  const [items, setItems] = useState<ChecklistItemJson[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** What's still to do on each icon with a list (What's left), kept up to date as items are ticked. */
  const [remainingByIcon, setRemainingByIcon] = useState<Record<string, { id: string; text: string }[]>>(() =>
    Object.fromEntries(initialProgress.map((entry) => [entry.markupId, entry.remaining])),
  );

  // The rings, from the start.
  useEffect(() => {
    const progressByIcon: Record<string, MarkupProgress> = {};
    for (const entry of initialProgress) progressByIcon[entry.markupId] = { done: entry.done, total: entry.total };
    setMarkupProgress(progressByIcon);
  }, [initialProgress, setMarkupProgress]);

  // The open icon's list.
  const markupId = selectedMarkup?.id ?? null;
  useEffect(() => {
    setItems(null);
    setError(null);
    if (!markupId) return;
    let current = true;
    api<ChecklistItemJson[]>(`/checklists/icons/${markupId}`)
      .then((loaded) => current && setItems(loaded))
      .catch((failure) => current && setError(failure instanceof Error ? failure.message : String(failure)));
    return () => {
      current = false;
    };
  }, [markupId]);

  // A tick, an add or a removal: recolour this icon's ring.
  const itemsChanged = useCallback(
    (latest: ChecklistItemJson[]) => {
      if (!markupId) return;
      const stillToDo = latest.filter((item) => !item.doneAt).map((item) => ({ id: item.id, text: item.text }));
      setRemainingByIcon((current) => {
        const before = current[markupId] ?? [];
        if (before.length === stillToDo.length && before.every((item, index) => item.id === stillToDo[index]!.id && item.text === stillToDo[index]!.text)) return current;
        return { ...current, [markupId]: stillToDo };
      });
      const done = latest.filter((item) => item.doneAt).length;
      const before = markupProgress[markupId];
      if (before && before.done === done && before.total === latest.length) return;
      if (!before && latest.length === 0) return;
      const next = { ...markupProgress };
      if (latest.length) next[markupId] = { done, total: latest.length };
      else delete next[markupId];
      setMarkupProgress(next);
    },
    [markupId, markupProgress, setMarkupProgress],
  );

  const whatsLeft = <WhatsLeft remainingByIcon={remainingByIcon} />;
  if (!markupId) return whatsLeft;
  // Nothing on it, and nobody here can add: say nothing.
  if (items && !items.length && !(canManage && !archived)) return whatsLeft;

  return (
    <>
    {whatsLeft}
    <PlanMarkupSection order={10}>
      <div className="border-t pt-2">
        {error ? (
          <Alert variant="error">{error}</Alert>
        ) : !items ? (
          <p className="flex min-h-touch items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading the checklist…
          </p>
        ) : (
          <ChecklistList
            key={markupId}
            addUrl={`/checklists/icons/${markupId}`}
            initial={items}
            canTick={canTick}
            canManage={canManage}
            archived={archived}
            firstPlaceholder="Add a to-do for this one, e.g. Fit off and test"
            padding="px-1"
            onItemsChange={itemsChanged}
            frame={({ count, editButton, children }) => (
              <>
                <div className="flex min-h-touch items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    Checklist
                    {count && <span className="ml-2 font-normal text-muted-foreground">{count}</span>}
                  </p>
                  {editButton}
                </div>
                {children}
              </>
            )}
          />
        )}
      </div>
    </PlanMarkupSection>
    </>
  );
}

/** Only keep the list open beside the plan on wide screens; on phones and tablets it would cover the icon you're going to. */
const STAYS_OPEN = "(min-width: 1024px)";
/** How many of an icon's to-dos to show under its name before "and n more". */
const ITEMS_SHOWN = 3;

/**
 * What's left (docs/plans-block.md): this sheet's icons with unticked items,
 * one row each with the items under it. Only icons showing now (on the
 * revision, layers and trades you have on) are listed, so a row always lands
 * on something you can see.
 */
function WhatsLeft({ remainingByIcon }: { remainingByIcon: Record<string, { id: string; text: string }[]> }) {
  const { placedMarkups, goTo, selectMarkup, hidden } = usePlanOverlay();
  const [open, setOpen] = useState(false);

  const rows = useMemo(
    () =>
      placedMarkups
        .map((icon) => ({ icon, items: remainingByIcon[icon.id] ?? [] }))
        .filter((row) => row.items.length > 0)
        .sort((first, second) => first.icon.name.localeCompare(second.icon.name, "en-AU", { numeric: true }) || first.icon.point[1] - second.icon.point[1] || first.icon.point[0] - second.icon.point[0]),
    [placedMarkups, remainingByIcon],
  );
  const itemCount = rows.reduce((total, row) => total + row.items.length, 0);
  const hasLists = Object.keys(remainingByIcon).length > 0;

  // No icon on this sheet has a checklist: no button.
  if (!hasLists || hidden) return null;

  const jump = (icon: (typeof rows)[number]["icon"]) => {
    goTo(icon.point);
    selectMarkup({ id: icon.id, name: icon.name });
    if (!window.matchMedia(STAYS_OPEN).matches) setOpen(false);
  };

  return (
    <>
      <PlanSideButton label="What's left" icon={<ListChecks />} badge={itemCount || null} active={open} onClick={() => setOpen(!open)} />
      {open && (
        <div className="pointer-events-auto absolute top-2 right-[4.5rem] left-2 flex max-h-[60%] max-w-sm flex-col rounded-xl bg-card text-card-foreground shadow-lg lg:max-h-[calc(100%-1rem)]">
          <div className="flex items-center gap-2 py-1 pr-1 pl-3">
            <p className="min-w-0 flex-1">
              <span className="block font-semibold">What&apos;s left</span>
              <span className="block text-sm text-muted-foreground">
                {itemCount ? `${itemCount} to do on ${rows.length} ${rows.length === 1 ? "icon" : "icons"}` : "All ticked off on this sheet"}
              </span>
            </p>
            <button type="button" onClick={() => setOpen(false)} className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted" aria-label="Close What's left">
              <X className="size-5" />
            </button>
          </div>
          {rows.length > 0 && (
            <Scroller className="border-t">
              <ul className="divide-y">
                {rows.map(({ icon, items }) => (
                  <li key={icon.id}>
                    <button type="button" onClick={() => jump(icon)} className="flex min-h-touch w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted" aria-label={`Go to ${icon.name}, ${items.length} left`}>
                      <LocateFixed className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-semibold">{icon.name}</span>
                          <span className="shrink-0 text-sm text-muted-foreground">{items.length} left</span>
                        </span>
                        <span className="block text-sm break-words text-muted-foreground">
                          {items
                            .slice(0, ITEMS_SHOWN)
                            .map((item) => item.text)
                            .join(" · ")}
                          {items.length > ITEMS_SHOWN && ` and ${items.length - ITEMS_SHOWN} more`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Scroller>
          )}
        </div>
      )}
    </>
  );
}
