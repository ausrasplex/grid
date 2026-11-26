"use client";

// A job's checklist (docs/stage-2-projects.md "Job checklist"): tap an item
// to tick it off (who and when show under it), add items at the bottom
// (several at once, one per line), and Edit to rename or remove them.
// Done items fold away under "Done (n)". A placed icon's checklist
// (docs/plans-block.md "Checklists and photos on icons") is the same list in
// the icon's panel on the plan.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Alert, Button, Section, api, cn, useAction } from "@grid/ui";
import { showOrder } from "../lines";
import type { ChecklistItemJson } from "../service";

/** "Today, 2:14 pm", "Yesterday, 9:05 am" or "26 Nov, 2:14 pm" (a different year adds it). */
function when(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (daysAgo === 0) return `Today, ${time}`;
  if (daysAgo === 1) return `Yesterday, ${time}`;
  const day = date.toLocaleDateString("en-AU", { day: "numeric", month: "short", ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
  return `${day}, ${time}`;
}

export function Checklist({
  jobId,
  initial,
  canTick,
  canManage,
  archived,
}: {
  jobId: string;
  initial: ChecklistItemJson[];
  canTick: boolean;
  canManage: boolean;
  /** An archived job's list is kept as it was. */
  archived: boolean;
}) {
  return (
    <ChecklistList
      addUrl={`/checklists/jobs/${jobId}`}
      initial={initial}
      canTick={canTick}
      canManage={canManage}
      archived={archived}
      firstPlaceholder="Add the first item, e.g. Rough-in Level 2"
      frame={({ count, editButton, children }) => (
        <Section title="Checklist" description={count} actions={editButton} flush>
          {children}
        </Section>
      )}
    />
  );
}

/** How the list sits on its page: a Section on the job page, a plain block in an icon's panel. */
type Frame = (parts: { count: string | undefined; editButton: ReactNode; children: ReactNode }) => ReactNode;

/** The list itself, shared by the job's checklist and a placed icon's. */
export function ChecklistList({
  addUrl,
  initial,
  canTick,
  canManage,
  archived,
  firstPlaceholder,
  frame,
  padding = "px-4 sm:px-5",
  onItemsChange,
}: {
  /** Where new items are posted (the job's list, or an icon's). */
  addUrl: string;
  initial: ChecklistItemJson[];
  canTick: boolean;
  canManage: boolean;
  /** An archived job's list is kept as it was. */
  archived: boolean;
  firstPlaceholder: string;
  frame: Frame;
  /** Side padding of each row. */
  padding?: string;
  /** Called after every change, e.g. to colour the ring around an icon. */
  onItemsChange?: (items: ChecklistItemJson[]) => void;
}) {
  const [items, setItems] = useState(initial);
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const action = useAction();
  const { todo, done } = useMemo(() => showOrder(items), [items]);
  const mayTick = canTick && !archived;
  const mayManage = canManage && !archived;
  const replace = (next: ChecklistItemJson) => setItems((current) => current.map((item) => (item.id === next.id ? next : item)));
  useEffect(() => onItemsChange?.(items), [items, onItemsChange]);

  const tick = async (item: ChecklistItemJson) => {
    const done = !item.doneAt;
    // Show it straight away; put it back if the save fails.
    replace({ ...item, doneAt: done ? new Date().toISOString() : null, doneBy: done ? { id: null, name: "You" } : null });
    const saved = await action.run(() => api<ChecklistItemJson>(`/checklists/items/${item.id}/tick`, { body: { done } }));
    replace(saved ?? item);
  };

  const add = async () => {
    const added = await action.run(() => api<ChecklistItemJson[]>(addUrl, { body: { text: adding } }));
    if (added) {
      setItems((current) => [...current, ...added]);
      setAdding("");
    }
  };

  const rename = async (item: ChecklistItemJson, text: string) => {
    if (!text.trim() || text.trim() === item.text) return;
    const saved = await action.run(() => api<ChecklistItemJson>(`/checklists/items/${item.id}`, { method: "PUT", body: { text } }));
    if (saved) replace(saved);
  };

  const remove = async (item: ChecklistItemJson) => {
    const removed = await action.run(() => api(`/checklists/items/${item.id}`, { method: "DELETE" }));
    if (removed) setItems((current) => current.filter((entry) => entry.id !== item.id));
  };

  const row = (item: ChecklistItemJson) =>
    editing ? (
      <EditRow key={item.id} item={item} onRename={(text) => void rename(item, text)} onRemove={() => void remove(item)} busy={action.busy} padding={padding} />
    ) : (
      <TickRow key={item.id} item={item} onTick={() => void tick(item)} disabled={!mayTick} padding={padding} />
    );

  const count = items.length ? `${done.length} of ${items.length} done` : undefined;

  const editButton =
    mayManage && items.length > 0 ? (
      <Button type="button" variant="ghost" className="text-primary" onClick={() => setEditing(!editing)}>
        {editing ? "Done" : (
          <>
            <Pencil /> Edit
          </>
        )}
      </Button>
    ) : undefined;

  return frame({
    count,
    editButton,
    children: (
    <>
      {items.length > 0 && (
        <ul className="divide-y">
          {todo.map(row)}
          {done.length > 0 &&
            (todo.length === 0 || showDone || editing ? (
              done.map(row)
            ) : (
              <li>
                <button type="button" onClick={() => setShowDone(true)} className={cn("flex min-h-touch w-full items-center text-sm font-semibold text-muted-foreground hover:bg-muted", padding)}>
                  Done ({done.length})
                </button>
              </li>
            ))}
        </ul>
      )}
      {items.length === 0 && !mayManage && <p className={cn("pb-4 text-muted-foreground", padding)}>Nothing on the checklist yet.</p>}
      {mayManage && !editing && (
        <form
          className={cn("flex items-start gap-2 pb-4", padding, items.length > 0 && "border-t pt-3")}
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <textarea
            aria-label="Add an item"
            rows={1}
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            onKeyDown={(event) => {
              // Enter adds; Shift+Enter (or pasting lines) gives several.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (adding.trim()) void add();
              }
            }}
            placeholder={items.length ? "Add an item" : firstPlaceholder}
            className="min-h-touch flex-1 resize-none rounded-md border border-input bg-card px-3 py-2.5 text-base field-sizing-content"
          />
          <Button type="submit" aria-label="Add" disabled={action.busy || !adding.trim()} className="size-touch shrink-0 p-0">
            <Plus />
          </Button>
        </form>
      )}
      {action.error && (
        <div className={cn("pb-4", padding)}>
          <Alert variant="error">{action.error}</Alert>
        </div>
      )}
    </>
    ),
  });
}

/** One item: the whole row ticks it. Done ones show who and when. */
function TickRow({ item, onTick, disabled, padding }: { item: ChecklistItemJson; onTick: () => void; disabled: boolean; padding: string }) {
  const done = !!item.doneAt;
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        disabled={disabled}
        onClick={onTick}
        className={cn("flex min-h-touch w-full items-start gap-3 py-2.5 text-left hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent", padding)}
      >
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm border-2 transition-colors",
            done ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
          )}
        >
          {done && <Check className="size-4" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block break-words", done && "text-muted-foreground line-through")}>{item.text}</span>
          {done && item.doneBy && item.doneAt && (
            <span className="block text-sm text-muted-foreground">
              {item.doneBy.name} · {when(item.doneAt)}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/** Edit mode: rename in place (saves when you leave the box), Bin to remove. */
function EditRow({ item, onRename, onRemove, busy, padding }: { item: ChecklistItemJson; onRename: (text: string) => void; onRemove: () => void; busy: boolean; padding: string }) {
  const [text, setText] = useState(item.text);
  return (
    <li className={cn("flex items-center gap-2 py-2", padding)}>
      <input
        aria-label="Item"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onRename(text)}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        className="min-h-touch min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-base"
      />
      <Button type="button" variant="ghost" aria-label={`Remove ${item.text}`} title="Remove" disabled={busy} onClick={onRemove} className="size-touch shrink-0 p-0 text-destructive">
        <Trash2 />
      </Button>
    </li>
  );
}
