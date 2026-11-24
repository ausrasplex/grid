"use client";

// The job's rooms: the order they print in (General always comes first),
// and renaming one, which moves every line in it.

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil } from "lucide-react";
import { Alert, Button, Field, FormActions, Sheet, SheetContent, api, useAction } from "@grid/ui";

export function RoomsSheet({ projectId, rooms: start, onClose, onSaved }: { projectId: string; rooms: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [rooms, setRooms] = useState(start);
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const action = useAction();

  const move = (index: number, by: -1 | 1) =>
    action.run(async () => {
      const next = [...rooms];
      const [room] = next.splice(index, 1);
      next.splice(index + by, 0, room!);
      setRooms(next);
      await api(`/handover/job/${projectId}/settings`, { method: "PUT", body: { roomOrder: next } });
      await onSaved();
    });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title={renaming ? `Rename ${renaming.from}` : "Rooms"} description={renaming ? "Every line in this room moves to the new name." : "The order rooms print in. General always comes first."}>
        {renaming ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void action.run(async () => {
                await api(`/handover/job/${projectId}/rooms/rename`, { body: renaming });
                setRooms(rooms.map((room) => (room === renaming.from ? renaming.to.trim() : room)).filter(Boolean));
                setRenaming(null);
                await onSaved();
              });
            }}
          >
            <Field label="Room name" value={renaming.to} onChange={(event) => setRenaming({ ...renaming, to: event.target.value })} hint="Leave blank to move these lines to General." autoFocus />
            <Alert variant="error">{action.error}</Alert>
            <FormActions>
              <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
                Back
              </Button>
              <Button type="submit" size="lg" disabled={action.busy}>
                Rename
              </Button>
            </FormActions>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <ol className="divide-y rounded-lg border">
              {rooms.map((room, index) => (
                <li key={room} className="flex min-h-touch-lg items-center gap-1 pl-3">
                  <span className="min-w-0 flex-1 truncate font-semibold">{room}</span>
                  <Button variant="ghost" size="icon" aria-label={`Move ${room} up`} disabled={action.busy || index === 0} onClick={() => void move(index, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Move ${room} down`} disabled={action.busy || index === rooms.length - 1} onClick={() => void move(index, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Rename ${room}`} onClick={() => setRenaming({ from: room, to: room })}>
                    <Pencil />
                  </Button>
                </li>
              ))}
            </ol>
            <Alert variant="error">{action.error}</Alert>
            <FormActions>
              <Button variant="outline" onClick={onClose}>
                Done
              </Button>
            </FormActions>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
