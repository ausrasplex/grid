"use client";

// Site notes: access and hazard info kept with the address, so every job
// there sees it (docs/navigation.md §4). Separate notes, each with a title:
// "Security office", "Lockbox", "Parking", "Hazards"… With two or more notes
// there's a search box that finds notes by their title or details.

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { Alert, Button, Field, FormActions, SearchInput, Section, api, cn, useAction } from "@grid/ui";

export interface SiteNoteJson {
  id: string;
  title: string;
  body: string;
  by: string | null;
  at: string | Date;
}

/** Titles offered while typing (any title is fine). */
const SUGGESTED_TITLES = ["Access", "Security office", "Lockbox", "Gate code", "Parking", "Keys", "Site contact", "Switchboard", "Hazards", "Asbestos", "Dogs", "Toilets"];

/** Every word typed must be in the title or details ("lock code" finds "Lockbox: code 4512"). */
const matches = (note: SiteNoteJson, words: string[]) => {
  const text = `${note.title}\n${note.body}`.toLowerCase();
  return words.every((word) => text.includes(word));
};

const when = (date: string | Date) => new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function SiteNotes({ siteId, initial, canEdit }: { siteId: string; initial: SiteNoteJson[]; canEdit: boolean }) {
  const [notes, setNotes] = useState(initial);
  /** The note being changed, "new" while adding, or null. */
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const action = useAction();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  // The note being changed stays in the list even if it stops matching.
  const shown = words.length ? notes.filter((note) => note.id === editing || matches(note, words)) : notes;

  const save = async (call: () => Promise<SiteNoteJson[]>) => {
    const next = await action.run(call);
    if (next) {
      setNotes(next);
      setEditing(null);
    }
    return !!next;
  };
  const move = (index: number, by: -1 | 1) => {
    const ids = notes.map((note) => note.id);
    [ids[index], ids[index + by]] = [ids[index + by]!, ids[index]!];
    void action.run(async () => setNotes(await api<SiteNoteJson[]>(`/sites/${siteId}/notes/order`, { method: "PUT", body: { ids } })));
  };

  return (
    <Section
      title="Site notes"
      description={notes.length ? undefined : "Security office, lockbox, where to park, the dog, the asbestos in the meter box. Every job here sees these."}
      flush={notes.length > 0}
      actions={
        canEdit && editing !== "new" ? (
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            <Plus /> Add note
          </Button>
        ) : undefined
      }
    >
      {notes.length > 1 && (
        <div className="px-4 pb-3 sm:px-5">
          <SearchInput label="Search site notes" placeholder="Search notes, e.g. gate code" value={query} onChange={(event) => setQuery(event.target.value)} className="lg:max-w-2xl" />
        </div>
      )}
      {words.length > 0 && shown.length === 0 && (
        <p className="border-t px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">
          No notes match &ldquo;{query.trim()}&rdquo;.{" "}
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setQuery("")}>
            Show all
          </button>
        </p>
      )}
      {shown.length > 0 && (
        <ul className={cn("divide-y", notes.length > 1 && "border-t")}>
          {shown.map((note) =>
            editing === note.id ? (
              <li key={note.id} className="px-4 py-3 sm:px-5">
                <NoteForm
                  initial={note}
                  busy={action.busy}
                  onCancel={() => setEditing(null)}
                  onSave={(input) => save(() => api<SiteNoteJson[]>(`/sites/notes/${note.id}`, { method: "PATCH", body: input }))}
                  onDelete={() => {
                    if (!window.confirm(`Delete the note "${note.title}"?`)) return;
                    void save(() => api<SiteNoteJson[]>(`/sites/notes/${note.id}`, { method: "DELETE" }));
                  }}
                />
              </li>
            ) : (
              <li key={note.id} className="flex items-start gap-2 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{note.title}</h3>
                  {note.body && <p className="mt-0.5 whitespace-pre-wrap">{note.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[note.by, when(note.at)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {canEdit && (
                  <div className="-my-1 -mr-2 flex shrink-0">
                    {/* Moving only makes sense with the whole list showing. */}
                    {notes.length > 1 && !words.length && (
                      <>
                        <IconButton label={`Move ${note.title} up`} disabled={notes.indexOf(note) === 0 || action.busy} onClick={() => move(notes.indexOf(note), -1)}>
                          <ArrowUp />
                        </IconButton>
                        <IconButton label={`Move ${note.title} down`} disabled={notes.indexOf(note) === notes.length - 1 || action.busy} onClick={() => move(notes.indexOf(note), 1)}>
                          <ArrowDown />
                        </IconButton>
                      </>
                    )}
                    <IconButton label={`Change ${note.title}`} onClick={() => setEditing(note.id)}>
                      <Pencil />
                    </IconButton>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {editing === "new" && (
        <div className={cn(notes.length > 0 && "border-t px-4 py-3 sm:px-5")}>
          <NoteForm initial={null} busy={action.busy} onCancel={() => setEditing(null)} onSave={(input) => save(() => api<SiteNoteJson[]>(`/sites/${siteId}/notes`, { body: input }))} />
        </div>
      )}
      {notes.length === 0 && editing !== "new" && <p className="text-muted-foreground">No notes yet.</p>}
      <div className={cn(notes.length > 0 && action.error && "px-4 pb-3 sm:px-5")}>
        <Alert variant="error">{action.error}</Alert>
      </div>
    </Section>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-touch items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

function NoteForm({
  initial,
  busy,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: SiteNoteJson | null;
  busy: boolean;
  onSave: (input: { title: string; body: string }) => Promise<boolean>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const listId = `note-titles-${initial?.id ?? "new"}`;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ title: title.trim(), body: body.trim() });
      }}
    >
      <Field label="Title" placeholder="e.g. Lockbox" list={listId} autoComplete="off" value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus />
      <datalist id={listId}>
        {SUGGESTED_TITLES.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      <label className="flex flex-col gap-2 text-sm font-medium lg:max-w-2xl">
        Details
        <textarea
          rows={4}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="e.g. Code 4512. Box is on the left of the side gate."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <FormActions>
        {onDelete && (
          <Button type="button" variant="ghost" className="text-destructive sm:mr-auto" onClick={onDelete} disabled={busy}>
            Delete note
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !title.trim()}>
          {busy ? "Saving…" : initial ? "Save note" : "Add note"}
        </Button>
      </FormActions>
    </form>
  );
}
