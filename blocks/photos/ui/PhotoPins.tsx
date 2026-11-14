"use client";

// Photo pins on a plan sheet (phase 4b): tap Photo, tap the spot, take or
// pick photos. They go through the same offline outbox as every other
// photo, so a pin dropped in a basement shows (hollow) straight away and
// fills in once it's sent. Photos pinned to the same spot share one pin.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, MapPinOff, X } from "lucide-react";
import { Button, PlanToolButton, Sheet, SheetContent, api, cn, toScreen, usePlanOverlay, usePlanPointer, type PlanPointer, type SheetPoint } from "@grid/ui";
import { addToOutbox, newId, prepareImage, type OutboxItem } from "./outbox";
import { useOutbox } from "./useOutbox";

export interface PinJson {
  id: string;
  fileId: string;
  x: number;
  y: number;
  caption: string | null;
  tag: "NONE" | "BEFORE" | "AFTER";
  at: string;
  by: string;
  canChange: boolean;
}

interface Pin {
  key: string;
  x: number;
  y: number;
  photos: PinJson[];
  /** Still on this phone, waiting to send. */
  waiting: OutboxItem[];
}

const TOOL = "photos.pin";
/** Photos within this many sheet units of each other share a pin. */
const SAME_SPOT = 1e-4;
const spotKey = (x: number, y: number) => `${Math.round(x / SAME_SPOT)}:${Math.round(y / SAME_SPOT)}`;
const when = (date: string) => new Date(date).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function PhotoPins({ projectId, jobName, initial, canAdd }: { projectId: string; jobName: string; initial: PinJson[]; canAdd: boolean }) {
  const overlay = usePlanOverlay();
  const { sheet, view, hidden, tool, setTool } = overlay;
  const [photos, setPhotos] = useState(initial);
  const [spot, setSpot] = useState<SheetPoint | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const { items: outbox } = useOutbox(projectId);

  const reload = useCallback(async () => {
    try {
      setPhotos(await api<PinJson[]>(`/photos/pins/${sheet.id}?job=${projectId}`));
    } catch {
      /* keep what's showing */
    }
  }, [sheet.id, projectId]);

  // A pinned photo reached the server: show the real one.
  useEffect(() => {
    const onUploaded = () => void reload();
    window.addEventListener("grid-photo-uploaded", onUploaded);
    return () => window.removeEventListener("grid-photo-uploaded", onUploaded);
  }, [reload]);

  const pins = useMemo(() => {
    const byKey = new Map<string, Pin>();
    const pinAt = (x: number, y: number) => {
      const key = spotKey(x, y);
      if (!byKey.has(key)) byKey.set(key, { key, x, y, photos: [], waiting: [] });
      return byKey.get(key)!;
    };
    for (const photo of photos) pinAt(photo.x, photo.y).photos.push(photo);
    for (const item of outbox) if (item.pin?.sheetId === sheet.id) pinAt(item.pin.x, item.pin.y).waiting.push(item);
    return [...byKey.values()];
  }, [photos, outbox, sheet.id]);
  const open = pins.find((pin) => pin.key === openKey) ?? null;

  // Tap the plan with the Photo tool to pick the spot.
  usePlanPointer(
    useCallback(
      (pointer: PlanPointer) => {
        if (tool === TOOL && pointer.kind === "click") setSpot(pointer.point);
      },
      [tool],
    ),
  );
  useEffect(() => {
    if (tool !== TOOL) setSpot(null);
  }, [tool]);

  const addPhotos = async (files: FileList | null, at: SheetPoint) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const items: OutboxItem[] = [];
      for (const file of [...files]) {
        const { blob, name } = await prepareImage(file);
        items.push({
          id: newId(),
          projectId,
          jobName,
          buildingId: sheet.buildingId,
          levelId: sheet.buildingId ? sheet.levelId : null,
          tag: "NONE",
          caption: `On ${sheet.number}`,
          takenAt: Date.now(),
          pin: { sheetId: sheet.id, x: at[0], y: at[1] },
          blob,
          name,
          state: "waiting",
        });
      }
      await addToOutbox(items);
      setSpot(null);
      setTool(null);
      setOpenKey(spotKey(at[0], at[1]));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const unpin = async (photo: PinJson) => {
    try {
      await api(`/photos/${photo.id}`, { method: "PATCH", body: { pin: null } });
      setPhotos((current) => current.filter((entry) => entry.id !== photo.id));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };

  // Where new photos go: the spot just tapped, or the open pin ("Add a photo here").
  const target = useRef<SheetPoint | null>(null);
  const choose = (input: HTMLInputElement | null, at: SheetPoint) => {
    target.current = at;
    input?.click();
  };

  return (
    <>
      {!hidden &&
        pins.map((pin) => {
          const [left, top] = toScreen(view, [pin.x, pin.y]);
          if (left < -40 || top < -40 || left > view.width + 40 || top > view.height + 40) return null;
          const count = pin.photos.length + pin.waiting.length;
          return (
            <button
              key={pin.key}
              type="button"
              onClick={() => setOpenKey(pin.key)}
              style={{ left, top }}
              aria-label={`${count} photo${count === 1 ? "" : "s"} pinned here`}
              className={cn(
                "pointer-events-auto absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 shadow-lg",
                pin.photos.length ? "border-white bg-primary text-primary-foreground" : "border-primary border-dashed bg-neutral-900/80 text-primary",
              )}
            >
              {pin.photos.length ? <Camera className="size-5" /> : <Loader2 className="size-5 animate-spin" />}
              {count > 1 && <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-neutral-900 px-1 text-center text-xs leading-5 font-bold text-white">{count}</span>}
            </button>
          );
        })}

      {spot && (
        <>
          <span
            className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-primary bg-primary/40"
            style={{ left: toScreen(view, spot)[0], top: toScreen(view, spot)[1] }}
          />
          <div className="pointer-events-auto absolute right-[4.5rem] bottom-2 left-2 mx-auto flex max-w-md flex-col gap-2 rounded-xl bg-card p-3 text-card-foreground shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">Pin a photo here</p>
              <button type="button" onClick={() => setTool(null)} className="-m-1 flex size-11 items-center justify-center rounded-md hover:bg-muted" aria-label="Cancel">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" disabled={busy} onClick={() => choose(camera.current, spot)}>
                <Camera /> Take photo
              </Button>
              <Button size="lg" variant="outline" disabled={busy} onClick={() => choose(library.current, spot)}>
                <ImagePlus /> Choose
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Tap somewhere else on the plan to move the spot.</p>
          </div>
        </>
      )}
      {tool === TOOL && !spot && (
        <div className="pointer-events-auto absolute inset-x-2 top-2 mx-auto flex max-w-md items-center gap-2 rounded-xl bg-neutral-900/95 px-3 py-2 text-sm text-white shadow-lg">
          <p className="flex-1">Tap the spot on the plan the photo is of.</p>
          <button type="button" className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10" onClick={() => setTool(null)} aria-label="Cancel">
            <X className="size-5" />
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="pointer-events-auto absolute inset-x-2 top-16 mx-auto max-w-md rounded-xl bg-destructive px-3 py-2 text-sm text-white shadow-lg" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => (target.current && void addPhotos(event.target.files, target.current), (event.target.value = ""))} />
      <input ref={library} type="file" accept="image/*" multiple className="hidden" onChange={(event) => (target.current && void addPhotos(event.target.files, target.current), (event.target.value = ""))} />

      {canAdd && <PlanToolButton label="Photo" icon={<Camera />} order={20} active={tool === TOOL} onClick={() => setTool(tool === TOOL ? null : TOOL)} />}

      <Sheet open={!!open} onOpenChange={(isOpen) => !isOpen && setOpenKey(null)}>
        <SheetContent title={open ? `${open.photos.length + open.waiting.length} photo${open.photos.length + open.waiting.length === 1 ? "" : "s"} here` : "Photos"} description={`On ${sheet.number}`}>
          {open && (
            <div className="flex flex-col gap-3">
              {open.waiting.length > 0 && (
                <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                  <Loader2 className="size-4 animate-spin" /> {open.waiting.length} still sending from this phone.
                </p>
              )}
              <ul className="flex flex-col gap-3">
                {[...open.photos].reverse().map((photo) => (
                  <li key={photo.id} className="flex flex-col gap-1.5">
                    <a href={`/api/files/${photo.fileId}?v=original`} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg bg-muted">
                      <img src={`/api/files/${photo.fileId}?v=display`} alt={photo.caption ?? ""} className="max-h-80 w-full object-contain" loading="lazy" />
                    </a>
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm">
                        {photo.caption && <span className="block">{photo.caption}</span>}
                        <span className="text-muted-foreground">
                          {photo.by} · {when(photo.at)}
                          {photo.tag !== "NONE" && ` · ${photo.tag === "BEFORE" ? "Before" : "After"}`}
                        </span>
                      </p>
                      {photo.canChange && (
                        <Button size="sm" variant="ghost" onClick={() => void unpin(photo)}>
                          <MapPinOff /> Unpin
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {canAdd && (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => choose(camera.current, [open.x, open.y])}>
                    <Camera /> Take another
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => choose(library.current, [open.x, open.y])}>
                    <ImagePlus /> Add from phone
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Pinned photos are in the job&apos;s photos too. Unpin takes a photo off the plan but keeps it.</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
