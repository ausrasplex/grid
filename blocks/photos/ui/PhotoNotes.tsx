"use client";

// Notes on one photo: a dated list, oldest first, that anyone in the
// business can add to ("Cable run behind wall, 450 mm down"). Yours (or
// anyone's, for Owner and Foreman) can be changed or deleted. Used on plan
// photo pins and in the job's photo viewer.

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Alert, Button, api, cn, useAction } from "@grid/ui";

export interface PhotoNoteJson {
  id: string;
  body: string;
  by: string;
  at: string;
  edited: boolean;
  canChange: boolean;
}

const when = (date: string) =>
  new Date(date).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const boxClass = "w-full rounded-md border bg-background px-3 py-2 text-base";

export function PhotoNotes({
  photoId,
  initial,
  canAdd,
  onChange,
  className,
}: {
  photoId: string;
  /** Already loaded (plan pins); otherwise they load here. */
  initial?: PhotoNoteJson[];
  canAdd: boolean;
  onChange?: (notes: PhotoNoteJson[]) => void;
  className?: string;
}) {
  const [notes, setNotes] = useState<PhotoNoteJson[] | null>(initial ?? null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const action = useAction();

  useEffect(() => {
    if (initial) return setNotes(initial);
    let alive = true;
    setNotes(null);
    api<PhotoNoteJson[]>(`/photos/${photoId}/notes`)
      .then((loaded) => alive && setNotes(loaded))
      .catch((error: Error) => alive && action.setError(error.message));
    return () => void (alive = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId]);

  const changed = (next: PhotoNoteJson[]) => {
    setNotes(next);
    onChange?.(next);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {notes === null ? (
        !action.error && <p className="text-sm text-muted-foreground">Loading notes…</p>
      ) : notes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-muted px-3 py-2">
              {editingId === note.id ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const next = await action.run(() => api<PhotoNoteJson[]>(`/photos/photo-notes/${note.id}`, { method: "PATCH", body: { body: editText.trim() } }));
                    if (next) {
                      changed(next);
                      setEditingId(null);
                    }
                  }}
                >
                  <textarea aria-label="Note" rows={3} autoFocus value={editText} onChange={(event) => setEditText(event.target.value)} className={boxClass} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={action.busy || !editText.trim()}>
                      Save
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {note.by} · {when(note.at)}
                      {note.edited && " · edited"}
                    </p>
                  </div>
                  {note.canChange && canAdd && (
                    <div className="-my-1 -mr-2 flex shrink-0">
                      <button type="button" aria-label="Change note" onClick={() => (setEditingId(note.id), setEditText(note.body))} className="flex size-touch items-center justify-center rounded-md text-muted-foreground hover:bg-background">
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete note"
                        disabled={action.busy}
                        onClick={async () => {
                          if (!window.confirm("Delete this note?")) return;
                          const next = await action.run(() => api<PhotoNoteJson[]>(`/photos/photo-notes/${note.id}`, { method: "DELETE" }));
                          if (next) changed(next);
                        }}
                        className="flex size-touch items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !canAdd && <p className="text-sm text-muted-foreground">No notes on this photo.</p>
      )}

      {canAdd && notes !== null && (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const next = await action.run(() => api<PhotoNoteJson[]>(`/photos/${photoId}/notes`, { body: { body: draft.trim() } }));
            if (next) {
              changed(next);
              setDraft("");
            }
          }}
        >
          <textarea aria-label="Add a note" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={notes.length ? "Add a note" : "Add a note, e.g. Cable run behind wall, 450 mm down"} className={boxClass} />
          {draft.trim() && (
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={action.busy}>
                Add note
              </Button>
            </div>
          )}
        </form>
      )}
      <Alert variant="error">{action.error}</Alert>
    </div>
  );
}
