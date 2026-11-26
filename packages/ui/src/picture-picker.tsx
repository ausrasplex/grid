"use client";

// Pick a picture for something: a business, a client, a client business, or
// yourself. Shows it in a circle with a Pencil (change) and a Bin (remove)
// on it. Grid makes it square on the server (a logo is kept whole, a photo is
// cropped to fill), so any picture will do. On a phone, the Pencil offers the
// camera or the photos.

import { useRef, useState, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Alert } from "./components/alert";
import { Avatar } from "./blocks";
import { useAction } from "./api";
import { cn } from "./lib/utils";

/**
 * Sends a picture to one of the /api/pictures addresses (POST) or takes it
 * off (DELETE). Returns the new address to show it from, or null for none.
 */
export async function sendPicture(path: string, file: File | null): Promise<string | null> {
  let response: Response;
  if (file) {
    const form = new FormData();
    form.append("file", file);
    response = await fetch(`/api${path}`, { method: "POST", body: form, credentials: "same-origin" });
  } else response = await fetch(`/api${path}`, { method: "DELETE", credentials: "same-origin" });
  const body = (await response.json().catch(() => null)) as { pictureUrl?: string | null; error?: { message?: string } } | null;
  if (!response.ok || !body) throw new Error(body?.error?.message ?? "Couldn't save the picture");
  return body.pictureUrl ?? null;
}

/**
 * A picture in a circle with two small round buttons on it: a Pencil at
 * the bottom right to change it (or add one) and a Bin at the bottom left
 * to take it off (only when there's one of its own). Each button is a
 * 36px circle with a 48px tap area around it.
 */
export function EditablePicture({
  name,
  src,
  canChange = true,
  canRemove,
  busy = false,
  onPick,
  onRemove,
  className,
}: {
  name: string;
  src: string | null;
  canChange?: boolean;
  /** Show the Bin: there's a picture of its own to take off. */
  canRemove: boolean;
  busy?: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  className?: string;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const corner =
    "absolute bottom-0 flex size-9 items-center justify-center rounded-full border bg-card text-foreground shadow-sm ring-2 ring-background transition hover:bg-muted disabled:opacity-50 after:absolute after:-inset-1.5 after:content-[''] [&_svg]:size-4";
  return (
    <div className={cn("relative size-24 shrink-0", className)}>
      <Avatar name={name} src={src} className={cn("size-full text-3xl transition", busy && "opacity-60")} />
      {canChange && (
        <>
          {canRemove && (
            <button type="button" aria-label="Remove picture" title="Remove picture" disabled={busy} onClick={onRemove} className={cn(corner, "-left-1")}>
              <Trash2 />
            </button>
          )}
          <button type="button" aria-label={canRemove ? "Change picture" : "Add a picture"} title={canRemove ? "Change picture" : "Add a picture"} disabled={busy} onClick={() => picker.current?.click()} className={cn(corner, "-right-1")}>
            <Pencil />
          </button>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onPick(file);
            }}
          />
        </>
      )}
    </div>
  );
}

export function PicturePicker({
  name,
  url,
  path,
  label = "Picture",
  hint,
  fallbackUrl = null,
  fallbackNote,
  canChange = true,
  onChange,
}: {
  /** For the initials when there's no picture. */
  name: string;
  url: string | null;
  /** Where it saves: "/pictures/company", "/pictures/client/<id>"… */
  path: string;
  label?: string;
  /** A short line beside the picture. */
  hint?: ReactNode;
  /** Shown when there's none of its own (a person shows their business's logo). */
  fallbackUrl?: string | null;
  /** Said beside it while the fallback is showing. */
  fallbackNote?: ReactNode;
  canChange?: boolean;
  onChange?: (url: string | null) => void;
}) {
  const [current, setCurrent] = useState(url);
  const action = useAction();

  const apply = async (file: File | null) => {
    const result = await action.run(() => sendPicture(path, file));
    if (result !== undefined) {
      setCurrent(result);
      onChange?.(result);
    }
  };
  const note = !current && fallbackUrl && fallbackNote ? fallbackNote : hint;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-4">
        <EditablePicture name={name} src={current ?? fallbackUrl} canChange={canChange} canRemove={!!current} busy={action.busy} onPick={(file) => void apply(file)} onRemove={() => void apply(null)} />
        {note && <p className="min-w-0 text-sm text-muted-foreground">{note}</p>}
      </div>
      <Alert variant="error">{action.error}</Alert>
    </div>
  );
}
