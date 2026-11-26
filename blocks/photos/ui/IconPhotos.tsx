"use client";

// Photos on a placed icon (docs/plans-block.md "Checklists and photos on
// icons"). Tapping an icon on the plan opens Markups' panel for it; this adds
// the icon's photos to it, Before and After side by side. They go through the
// same offline outbox as every other photo, are ordinary job photos too, and
// keep their dated notes. Spots with no icon still use photo pins.

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2, Unlink } from "lucide-react";
import { Alert, Button, PlanMarkupSection, Segmented, Sheet, SheetContent, api, cn, usePlanOverlay } from "@grid/ui";
import { addToOutbox, newId, prepareImage, type OutboxItem } from "./outbox";
import { useOutbox } from "./useOutbox";
import { PhotoNotes, type PhotoNoteJson } from "./PhotoNotes";

export interface IconPhotoJson {
  id: string;
  fileId: string;
  caption: string | null;
  tag: Tag;
  at: string;
  by: string;
  canChange: boolean;
  notes: PhotoNoteJson[];
}

type Tag = "NONE" | "BEFORE" | "AFTER";

const TAG_NAMES: Record<Tag, string> = { BEFORE: "Before", AFTER: "After", NONE: "Other" };
const when = (date: string) => new Date(date).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function IconPhotos({ projectId, jobName, canAdd }: { projectId: string; jobName: string; canAdd: boolean }) {
  const overlay = usePlanOverlay();
  const { sheet, selectedMarkup } = overlay;
  const markupId = selectedMarkup?.id ?? null;
  const [photos, setPhotos] = useState<IconPhotoJson[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  /** The tag the next photos get (which column's button was tapped). */
  const nextTag = useRef<Tag>("NONE");
  const { items: outbox } = useOutbox(projectId);

  const reload = useCallback(async () => {
    if (!markupId) return;
    try {
      setPhotos(await api<IconPhotoJson[]>(`/photos/icons/${markupId}`));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, [markupId]);

  useEffect(() => {
    setPhotos(null);
    setError(null);
    setOpenId(null);
    void reload();
  }, [reload]);

  // A photo on this icon reached the server: show the real one.
  useEffect(() => {
    const onUploaded = () => void reload();
    window.addEventListener("grid-photo-uploaded", onUploaded);
    return () => window.removeEventListener("grid-photo-uploaded", onUploaded);
  }, [reload]);

  if (!markupId || !selectedMarkup) return null;
  const waiting = outbox.filter((item) => item.markupId === markupId);
  const open = photos?.find((photo) => photo.id === openId) ?? null;
  // Nothing on it, and nobody here can add: say nothing.
  if (photos && !photos.length && !waiting.length && !canAdd) return null;

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const items: OutboxItem[] = [];
      for (const file of files) {
        const { blob, name } = await prepareImage(file);
        items.push({
          id: newId(),
          projectId,
          jobName,
          buildingId: sheet.buildingId,
          levelId: sheet.buildingId ? sheet.levelId : null,
          tag: nextTag.current,
          caption: `${selectedMarkup.name} on ${sheet.number}`,
          takenAt: Date.now(),
          markupId,
          blob,
          name,
          state: "waiting",
        });
      }
      await addToOutbox(items);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const choose = (input: HTMLInputElement | null, tag: Tag) => {
    nextTag.current = tag;
    input?.click();
  };

  const change = async (photo: IconPhotoJson, body: { tag: Tag } | { markupId: null }) => {
    try {
      await api(`/photos/${photo.id}`, { method: "PATCH", body });
      if ("markupId" in body) {
        setPhotos((current) => current?.filter((entry) => entry.id !== photo.id) ?? null);
        setOpenId(null);
      } else setPhotos((current) => current?.map((entry) => (entry.id === photo.id ? { ...entry, tag: body.tag } : entry)) ?? null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  /** Deletes the photo (off the icon and the job's photos). It sits in Recently deleted (Settings › Storage) until the clean-up removes it. */
  const remove = async (photo: IconPhotoJson) => {
    if (!window.confirm("Delete this photo? It comes off the icon and the job's photos. It can be restored from Settings › Storage for a while.")) return;
    try {
      await api(`/photos/${photo.id}`, { method: "DELETE" });
      setPhotos((current) => current?.filter((entry) => entry.id !== photo.id) ?? null);
      setOpenId(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const column = (tag: Tag) => {
    const shown = (photos ?? []).filter((photo) => photo.tag === tag);
    const sending = waiting.filter((item) => item.tag === tag);
    if (tag === "NONE" && !shown.length && !sending.length) return null;
    return (
      <div className={cn("flex min-w-0 flex-col gap-1.5", tag === "NONE" && "col-span-2")}>
        <p className="text-xs font-semibold text-muted-foreground uppercase">{TAG_NAMES[tag]}</p>
        <div className={cn("grid gap-1.5", tag === "NONE" ? "grid-cols-4" : "grid-cols-2")}>
          {[...shown].reverse().map((photo) => (
            <button key={photo.id} type="button" onClick={() => setOpenId(photo.id)} className="aspect-square overflow-hidden rounded-md bg-muted" aria-label={`Open ${TAG_NAMES[tag].toLowerCase()} photo from ${when(photo.at)}`}>
              <img src={`/api/files/${photo.fileId}?v=thumb`} alt="" className="size-full object-cover" loading="lazy" />
            </button>
          ))}
          {sending.map((item) => (
            <span key={item.id} className="flex aspect-square items-center justify-center rounded-md bg-muted" aria-label="Sending">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </span>
          ))}
          {tag !== "NONE" && !shown.length && !sending.length && <p className="col-span-2 py-2 text-sm text-muted-foreground">None yet</p>}
        </div>
        {canAdd && tag !== "NONE" && (
          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="outline" disabled={busy} onClick={() => choose(camera.current, tag)} aria-label={`Take a ${TAG_NAMES[tag].toLowerCase()} photo`} className="h-touch">
              <Camera />
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => choose(library.current, tag)} aria-label={`Add a ${TAG_NAMES[tag].toLowerCase()} photo from the phone`} className="h-touch">
              <ImagePlus />
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <PlanMarkupSection order={20}>
      <div className="flex flex-col gap-2 border-t pt-2">
        <p className="flex min-h-touch items-center text-sm font-semibold">
          Photos
          {photos && photos.length + waiting.length > 0 && <span className="ml-2 font-normal text-muted-foreground">{photos.length + waiting.length}</span>}
        </p>
        {!photos && !error ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading photos…
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {column("BEFORE")}
            {column("AFTER")}
            {column("NONE")}
          </div>
        )}
        {error && (
          <div role="alert" onClick={() => setError(null)}>
            <Alert variant="error">{error}</Alert>
          </div>
        )}
      </div>

      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => (void addPhotos(event.target.files), (event.target.value = ""))} />
      <input ref={library} type="file" accept="image/*" multiple className="hidden" onChange={(event) => (void addPhotos(event.target.files), (event.target.value = ""))} />

      <Sheet open={!!open} onOpenChange={(isOpen) => !isOpen && setOpenId(null)}>
        <SheetContent title={open ? `${TAG_NAMES[open.tag]} photo` : "Photo"} description={selectedMarkup.name}>
          {open && (
            <div className="flex flex-col gap-3">
              <a href={`/api/files/${open.fileId}?v=original`} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg bg-muted">
                <img src={`/api/files/${open.fileId}?v=display`} alt={open.caption ?? ""} className="max-h-[60vh] w-full object-contain" />
              </a>
              <p className="text-sm text-muted-foreground">
                {open.by} · {when(open.at)}
              </p>
              {open.canChange && (
                <Segmented
                  label="Before or after"
                  value={open.tag}
                  onChange={(tag) => void change(open, { tag })}
                  items={(["BEFORE", "AFTER", "NONE"] as Tag[]).map((tag) => ({ value: tag, label: TAG_NAMES[tag] }))}
                />
              )}
              <PhotoNotes
                photoId={open.id}
                initial={open.notes}
                canAdd={canAdd}
                onChange={(notes) => setPhotos((current) => current?.map((entry) => (entry.id === open.id ? { ...entry, notes } : entry)) ?? null)}
              />
              {open.canChange && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => void change(open, { markupId: null })}>
                    <Unlink /> Take off this icon
                  </Button>
                  <Button variant="ghost" className="text-destructive" onClick={() => void remove(open)}>
                    <Trash2 /> Delete
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Photos on an icon are in the job&apos;s photos too. Taking one off the icon keeps it; Delete removes it.</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PlanMarkupSection>
  );
}
