"use client";

// Site notes: access and hazard info kept with the address, so every job
// there sees it (docs/navigation.md §4).

import { useState } from "react";
import { Alert, Button, FormActions, Icon, Section, api, useAction } from "@grid/ui";

export function SiteNotes({ siteId, initial, canEdit }: { siteId: string; initial: string | null; canEdit: boolean }) {
  const [notes, setNotes] = useState(initial ?? "");
  const [draft, setDraft] = useState(notes);
  const [editing, setEditing] = useState(false);
  const action = useAction();

  return (
    <Section
      title="Site notes"
      description="Gate codes, where to park, the dog, the asbestos in the meter box. Every job here sees these."
      actions={
        canEdit && !editing ? (
          <Button variant="outline" size="sm" onClick={() => (setDraft(notes), setEditing(true))}>
            <Icon name="edit" /> {notes ? "Edit" : "Add"}
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await action.run(() => api(`/sites/${siteId}`, { method: "PATCH", body: { notes: draft.trim() || null } }));
            if (ok) {
              setNotes(draft.trim());
              setEditing(false);
            }
          }}
        >
          <label className="sr-only" htmlFor={`notes-${siteId}`}>Site notes</label>
          <textarea
            id={`notes-${siteId}`}
            rows={6}
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" disabled={action.busy}>{action.busy ? "Saving…" : "Save notes"}</Button>
          </FormActions>
        </form>
      ) : notes ? (
        <p className="whitespace-pre-wrap">{notes}</p>
      ) : (
        <p className="text-muted-foreground">No notes yet.</p>
      )}
    </Section>
  );
}
