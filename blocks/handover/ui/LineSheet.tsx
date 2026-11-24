"use client";

// One line on the handover list: its room (typed, with the job's rooms
// suggested), quantity (blank prints TBC), a note for this job, and the
// other finishes in the material's family to swap to.

import { useEffect, useId, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { Alert, Button, Field, FormActions, Sheet, SheetContent, api, cn, useAction } from "@grid/ui";
import { MaterialPicture, type MaterialJson } from "@grid/block-materials/components";
import { finishLine, type LineJson } from "./shared";

export function LineSheet({
  projectId,
  line,
  material,
  room: startRoom,
  rooms,
  showQty,
  canEdit,
  onClose,
  onSaved,
}: {
  projectId: string;
  /** Null for a new line. */
  line: LineJson | null;
  material: MaterialJson;
  room: string | null;
  rooms: string[];
  showQty: boolean;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [picked, setPicked] = useState<MaterialJson>(material);
  const [room, setRoom] = useState(startRoom ?? "");
  const [qty, setQty] = useState(line?.qty === null || line?.qty === undefined ? "" : String(line.qty));
  const [note, setNote] = useState(line?.note ?? "");
  const [family, setFamily] = useState<MaterialJson[]>([]);
  const action = useAction();
  const listId = useId();

  useEffect(() => {
    if (!material.familyId) return;
    void api<MaterialJson[]>(`/materials?family=${material.familyId}`)
      .then((rows) => setFamily(rows.filter((row) => !row.removed)))
      .catch(() => setFamily([]));
  }, [material.familyId]);

  const save = () =>
    action.run(async () => {
      const body = { materialId: picked.id, room: room || null, qty: qty.trim() || null, note: note || null };
      if (line) await api(`/handover/lines/${line.id}`, { method: "PUT", body });
      else await api(`/handover/job/${projectId}/lines`, { body });
      await onSaved();
    });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title={line ? "Handover line" : "Add to the list"}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex items-center gap-3">
            <MaterialPicture material={picked} className="size-16" />
            <div className="min-w-0">
              <p className="font-semibold">{[picked.itemType, picked.name].filter(Boolean).join(": ")}</p>
              <p className="text-sm text-muted-foreground">{finishLine(picked) || "No brand or finish yet"}</p>
            </div>
          </div>

          {family.length > 1 && (
            <fieldset className="flex flex-col gap-2" disabled={!canEdit}>
              <legend className="mb-1 text-sm font-medium">Finish</legend>
              <div className="flex flex-wrap gap-2">
                {family.map((other) => (
                  <button
                    key={other.id}
                    type="button"
                    onClick={() => setPicked(other)}
                    aria-pressed={other.id === picked.id}
                    className={cn(
                      "flex min-h-touch items-center gap-2 rounded-lg border px-3 text-sm font-medium",
                      other.id === picked.id ? "border-primary bg-primary/10" : "border-input bg-card hover:bg-muted",
                    )}
                  >
                    <MaterialPicture material={other} className="size-7" />
                    {other.finish ?? other.name}
                    {other.id === picked.id && <Check className="size-4 text-primary" />}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <Field label="Room" placeholder="General" value={room} onChange={(event) => setRoom(event.target.value)} list={listId} hint="Leave blank for General." disabled={!canEdit} autoFocus={!line} />
          <datalist id={listId}>
            {rooms.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <Field
            label="Quantity"
            inputMode="decimal"
            placeholder="TBC"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            hint={showQty ? "Leave blank and the sheet says TBC." : "Quantities are hidden on this job's sheet (Sheet settings), but kept."}
            disabled={!canEdit}
          />
          <Field label="Note for this job" placeholder="Dimmer on the left" value={note} onChange={(event) => setNote(event.target.value)} disabled={!canEdit} />

          <Alert variant="error">{action.error}</Alert>
          {canEdit && (
            <FormActions>
              {line && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  disabled={action.busy}
                  onClick={() => {
                    if (!window.confirm(`Take ${line.material.name} off the handover list?`)) return;
                    void action.run(async () => {
                      await api(`/handover/lines/${line.id}`, { method: "DELETE" });
                      await onSaved();
                    });
                  }}
                >
                  <Trash2 /> Remove
                </Button>
              )}
              <Button type="submit" size="lg" disabled={action.busy}>
                {action.busy ? "Saving…" : line ? "Save" : "Add to the list"}
              </Button>
            </FormActions>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}
