"use client";

// A placed icon's own checklist (docs/plans-block.md "Checklists and photos
// on icons"). Tapping an icon on the plan opens Markups' panel for it; this
// adds the icon's checklist to that panel, and colours the ring around each
// icon by how much of its list is done.

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, PlanMarkupSection, api, usePlanOverlay, type MarkupProgress } from "@grid/ui";
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

  if (!markupId) return null;
  // Nothing on it, and nobody here can add: say nothing.
  if (items && !items.length && !(canManage && !archived)) return null;

  return (
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
  );
}
