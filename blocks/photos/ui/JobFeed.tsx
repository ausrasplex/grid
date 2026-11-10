"use client";

// Photos & notes on a job page, for the area you're in (or the whole job).
// Newest first, grouped by day. Photos still on the phone show too, marked
// "Waiting", so nothing looks lost while there's no signal.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  FormActions,
  Icon,
  Section,
  Segmented,
  Sheet,
  SheetContent,
  api,
  cn,
  useAction,
} from "@grid/ui";
import type { FeedItem, NoteItem, PhotoItem } from "../service";
import { AddPhotos } from "./AddPhotos";
import { areaLabel, type AreaOpt } from "./areas";
import { OutboxBar } from "./OutboxBar";
import { useOutbox } from "./useOutbox";

type Item = (Omit<PhotoItem, "at"> | Omit<NoteItem, "at">) & { at: string };
export interface Feed {
  items: Item[];
  counts: { photos: number; before: number; after: number; notes: number };
}

interface Props {
  job: { id: string; name: string; status: "ACTIVE" | "COMPLETED" };
  areas: AreaOpt[];
  area: AreaOpt | null;
  initial: Feed;
  canAdd: boolean;
  canManage: boolean;
  userId: string;
}

const fileUrl = (id: string, variant: "thumb" | "display" | "original") => `/api/files/${id}?v=${variant}`;

function dayLabel(date: Date) {
  const today = new Date();
  const start = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((start(today) - start(date)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
const time = (date: Date) => date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });

export function JobFeed({ job, areas, area, initial, canAdd, canManage, userId }: Props) {
  const [scope, setScope] = useState<"area" | "job">(area ? "area" : "job");
  const [tag, setTag] = useState<"ALL" | "BEFORE" | "AFTER">("ALL");
  const [feed, setFeed] = useState<Feed>(initial);
  const [picked, setPicked] = useState<File[] | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const writable = canAdd && job.status === "ACTIVE";
  const outbox = useOutbox(job.id);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (scope === "area" && area) {
      params.set("building", area.buildingId);
      if (area.levelId) params.set("level", area.levelId);
    }
    if (tag !== "ALL") params.set("tag", tag);
    return params.toString();
  }, [scope, tag, area]);

  const reload = useCallback(async () => {
    try {
      setFeed(await api<Feed>(`/photos/jobs/${job.id}?${query}`));
    } catch {
      /* offline: keep what we have */
    }
  }, [job.id, query]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false); // first render uses the server's data
    void reload();
  }, [reload]);
  useEffect(() => {
    const onUploaded = (event: Event) => (event as CustomEvent).detail?.projectId === job.id && reload();
    window.addEventListener("grid-photo-uploaded", onUploaded);
    return () => window.removeEventListener("grid-photo-uploaded", onUploaded);
  }, [job.id, reload]);

  // Photos still on the phone for what's being shown.
  const pending = outbox.items.filter((item) => {
    if (tag !== "ALL" && item.tag !== tag) return false;
    if (scope === "area" && area) return item.buildingId === area.buildingId && (!area.levelId || item.levelId === area.levelId);
    return true;
  });
  const pendingUrls = useMemo(() => new Map(pending.map((upload) => [upload.id, URL.createObjectURL(upload.blob)])), [pending.map((upload) => upload.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => pendingUrls.forEach((pendingUrl) => URL.revokeObjectURL(pendingUrl)), [pendingUrls]);

  const photos = feed.items.filter((item): item is Item & { kind: "photo" } => item.kind === "photo");
  const groups = useMemo(() => {
    const out: { label: string; items: Item[] }[] = [];
    for (const item of feed.items) {
      const label = dayLabel(new Date(item.at));
      const lastGroup = out.at(-1);
      if (lastGroup?.label === label) lastGroup.items.push(item);
      else out.push({ label, items: [item] });
    }
    return out;
  }, [feed.items]);

  const areaName = area ? (areaLabel(areas, area.buildingId, area.levelId) ?? "This area") : null;
  const title = "Photos & notes";

  return (
    <Section
      title={title}
      description={
        feed.counts.photos || feed.counts.notes
          ? `${feed.counts.photos} photo${feed.counts.photos === 1 ? "" : "s"} · ${feed.counts.notes} note${feed.counts.notes === 1 ? "" : "s"}${scope === "area" && areaName && areas.length > 1 ? ` on ${areaName}` : ""}`
          : undefined
      }
      actions={
        <a href={`/b/photos/report/${job.id}`} className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-primary hover:bg-muted">
          <Icon name="file" className="size-4" /> Report
        </a>
      }
    >
      <div className="flex flex-col gap-4">
        {writable && (
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" onClick={() => fileInput.current?.click()}>
              <Icon name="camera" /> Add photos
            </Button>
            <Button size="lg" variant="outline" onClick={() => setNoteOpen(true)}>
              <Icon name="note" /> Add note
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                if (files.length) setPicked(files);
                event.target.value = "";
              }}
            />
          </div>
        )}

        <OutboxBar projectId={job.id} />

        <div className="flex flex-col gap-2 sm:flex-row">
          {area && areas.length > 1 && (
            <Segmented
              label="Show"
              value={scope}
              onChange={setScope}
              items={[
                { value: "area", label: areaName ?? "This area" },
                { value: "job", label: "Whole job" },
              ]}
            />
          )}
          <Segmented
            label="Photo tags"
            value={tag}
            onChange={setTag}
            items={[
              { value: "ALL", label: "All" },
              { value: "BEFORE", label: "Before", count: feed.counts.before },
              { value: "AFTER", label: "After", count: feed.counts.after },
            ]}
          />
        </div>

        {pending.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">On this phone</h3>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
              {pending.map((upload) => (
                <div key={upload.id} className="relative aspect-square overflow-hidden rounded-md bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pendingUrls.get(upload.id)} alt="" className="size-full object-cover opacity-60" />
                  <span className="absolute inset-x-1 bottom-1 rounded bg-background/80 px-1 text-center text-xs font-semibold">
                    {upload.state === "failed" ? "Not saved" : upload.state === "uploading" ? "Uploading" : "Waiting"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {groups.length === 0 && pending.length === 0 ? (
          <EmptyState title={tag === "ALL" ? "Nothing here yet" : `No ${tag === "BEFORE" ? "before" : "after"} photos yet`}>
            {writable ? "Photos and notes you add show here, newest first." : undefined}
          </EmptyState>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</h3>
              <DayItems
                items={group.items}
                areas={areas}
                showArea={scope === "job" && areas.length > 1}
                onOpen={(id) => setViewing(photos.findIndex((photo) => photo.id === id))}
                canChange={(byId) => writable && (byId === userId || canManage)}
                onChanged={reload}
              />
            </div>
          ))
        )}
      </div>

      <Sheet open={!!picked} onOpenChange={(open) => !open && setPicked(null)}>
        <SheetContent title={picked && picked.length > 1 ? `Add ${picked.length} photos` : "Add a photo"} description={job.name}>
          {picked && (
            <div className="px-2">
              <AddPhotos
                files={picked}
                job={{ id: job.id, name: job.name }}
                areas={areas}
                defaultArea={scope === "area" && area ? { buildingId: area.buildingId, levelId: area.levelId } : null}
                onSaved={() => setPicked(null)}
                onCancel={() => setPicked(null)}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <NoteSheet open={noteOpen} onOpenChange={setNoteOpen} jobId={job.id} area={scope === "area" ? area : null} areaName={scope === "area" ? areaName : null} onSaved={reload} />

      {viewing !== null && viewing >= 0 && photos[viewing] && (
        <Viewer
          photos={photos}
          index={viewing}
          setIndex={setViewing}
          areas={areas}
          canChange={(byId) => writable && (byId === userId || canManage)}
          onChanged={reload}
        />
      )}
    </Section>
  );
}

function DayItems({
  items,
  areas,
  showArea,
  onOpen,
  canChange,
  onChanged,
}: {
  items: Item[];
  areas: AreaOpt[];
  showArea: boolean;
  onOpen: (id: string) => void;
  canChange: (byId: string) => boolean;
  onChanged: () => void;
}) {
  // Runs of photos become a grid; notes sit between them as cards.
  const blocks: (Item[] | Item)[] = [];
  for (const item of items) {
    const last = blocks.at(-1);
    if (item.kind === "photo" && Array.isArray(last)) last.push(item);
    else blocks.push(item.kind === "photo" ? [item] : item);
  }
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, index) =>
        Array.isArray(block) ? (
          <div key={index} className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            {block.map((item) => {
              const photo = item as Item & { kind: "photo" };
              return (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => onOpen(photo.id)}
                  className="relative aspect-square overflow-hidden rounded-md bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={photo.caption || `Photo by ${photo.by} at ${time(new Date(photo.at))}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(photo.fileId, "thumb")} alt="" loading="lazy" className="size-full object-cover" />
                  {photo.tag !== "NONE" && (
                    <span className="absolute top-1 left-1 rounded bg-primary px-1.5 text-[11px] font-bold text-primary-foreground uppercase">
                      {photo.tag === "BEFORE" ? "Before" : "After"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <NoteCard key={block.id} note={block as Item & { kind: "note" }} area={showArea ? areaLabel(areas, block.buildingId, block.levelId) : null} canChange={canChange(block.byId)} onChanged={onChanged} />
        ),
      )}
    </div>
  );
}

function NoteCard({ note, area, canChange, onChanged }: { note: Item & { kind: "note" }; area: string | null; canChange: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const action = useAction();
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await action.run(() => api(`/photos/notes/${note.id}`, { method: "PATCH", body: { body } }))) {
              setEditing(false);
              onChanged();
            }
          }}
        >
          <textarea aria-label="Note" rows={4} value={body} onChange={(event) => setBody(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-base" />
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" disabled={action.busy}>Save</Button>
          </FormActions>
        </form>
      ) : (
        <>
          <p className="whitespace-pre-wrap">{note.body}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Icon name="note" className="size-4" />
            <span className="min-w-0 flex-1 truncate">
              {[note.by, time(new Date(note.at)), area, note.edited ? "edited" : null].filter(Boolean).join(" · ")}
            </span>
            {canChange && (
              <>
                <button type="button" className="min-h-touch px-2 font-semibold" onClick={() => setEditing(true)}>Edit</button>
                <button
                  type="button"
                  className="min-h-touch px-2 font-semibold text-destructive"
                  onClick={async () => {
                    if (!window.confirm("Delete this note?")) return;
                    if (await action.run(() => api(`/photos/notes/${note.id}`, { method: "DELETE" }))) onChanged();
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function NoteSheet({
  open,
  onOpenChange,
  jobId,
  area,
  areaName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  area: AreaOpt | null;
  areaName: string | null;
  onSaved: () => void;
}) {
  const [body, setBody] = useState("");
  const action = useAction();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Add a note" description={areaName ? `On ${areaName}` : "For the whole job"}>
        <form
          className="flex flex-col gap-3 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await action.run(() =>
              api("/photos/notes", { body: { projectId: jobId, buildingId: area?.buildingId ?? null, levelId: area?.levelId ?? null, body } }),
            );
            if (ok) {
              setBody("");
              onOpenChange(false);
              onSaved();
            }
          }}
        >
          <textarea
            aria-label="Note"
            rows={6}
            autoFocus
            required
            placeholder="e.g. Isolated circuit 4 at the board. Neutral link loose, retightened."
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-base"
          />
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="submit" size="lg" disabled={action.busy || !body.trim()}>
              {action.busy ? "Saving…" : "Save note"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Full-screen photo viewer: swipe or arrows for the next one; edit or delete your own. */
function Viewer({
  photos,
  index,
  setIndex,
  areas,
  canChange,
  onChanged,
}: {
  photos: (Item & { kind: "photo" })[];
  index: number;
  setIndex: (index: number | null) => void;
  areas: AreaOpt[];
  canChange: (byId: string) => boolean;
  onChanged: () => void;
}) {
  const photo = photos[index]!;
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [tag, setTag] = useState(photo.tag);
  const action = useAction();
  const touchX = useRef<number | null>(null);
  const step = useCallback((offset: number) => setIndex(Math.max(0, Math.min(photos.length - 1, index + offset))), [index, photos.length, setIndex]);

  useEffect(() => {
    setCaption(photo.caption ?? "");
    setTag(photo.tag);
    setEditing(false);
  }, [photo.id, photo.caption, photo.tag]);
  useEffect(() => {
    const onKey = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") setIndex(null);
      if (keyboardEvent.key === "ArrowRight") step(1);
      if (keyboardEvent.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, setIndex]);

  const where = areaLabel(areas, photo.buildingId, photo.levelId);
  const at = new Date(photo.at);

  return (
    <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center gap-2 px-2 pt-safe">
        <button type="button" aria-label="Close" onClick={() => setIndex(null)} className="flex size-touch items-center justify-center rounded-full hover:bg-white/10">
          <Icon name="close" />
        </button>
        <span className="flex-1 text-center text-sm">{index + 1} of {photos.length}</span>
        <a href={`${fileUrl(photo.fileId, "original")}&download=1`} aria-label="Download full size" className="flex size-touch items-center justify-center rounded-full hover:bg-white/10">
          <Icon name="arrow-down" />
        </a>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onTouchStart={(event) => (touchX.current = event.touches[0]!.clientX)}
        onTouchEnd={(event) => {
          if (touchX.current === null) return;
          const swipeDistance = event.changedTouches[0]!.clientX - touchX.current;
          if (Math.abs(swipeDistance) > 50) step(swipeDistance < 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fileUrl(photo.fileId, "display")} alt={photo.caption ?? ""} className="max-h-full max-w-full object-contain" />
        {index > 0 && (
          <button type="button" aria-label="Previous photo" onClick={() => step(-1)} className="absolute left-2 hidden size-12 items-center justify-center rounded-full bg-black/50 md:flex">
            <Icon name="chevron-right" className="rotate-180" />
          </button>
        )}
        {index < photos.length - 1 && (
          <button type="button" aria-label="Next photo" onClick={() => step(1)} className="absolute right-2 hidden size-12 items-center justify-center rounded-full bg-black/50 md:flex">
            <Icon name="chevron-right" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2 bg-black/80 px-4 pt-3 pb-safe">
        {editing ? (
          <form
            className="flex flex-col gap-3 pb-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await action.run(() => api(`/photos/${photo.id}`, { method: "PATCH", body: { caption: caption.trim() || null, tag } }))) {
                setEditing(false);
                onChanged();
              }
            }}
          >
            <input aria-label="Caption" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Caption" className="h-touch rounded-md bg-white/10 px-3 text-base text-white" />
            <div className="flex gap-1">
              {(["NONE", "BEFORE", "AFTER"] as const).map((option) => (
                <button key={option} type="button" aria-pressed={tag === option} onClick={() => setTag(option)} className={cn("h-10 flex-1 rounded-md text-sm font-semibold", tag === option ? "bg-white text-black" : "bg-white/10")}>
                  {option === "NONE" ? "Neither" : option === "BEFORE" ? "Before" : "After"}
                </button>
              ))}
            </div>
            {action.error && <p className="text-sm text-red-300">{action.error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1 text-white hover:bg-white/10" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={action.busy}>Save</Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {photo.caption && <p className="font-semibold">{photo.caption}</p>}
                <p className="text-sm text-white/70">
                  {[photo.tag !== "NONE" ? (photo.tag === "BEFORE" ? "Before" : "After") : null, where, photo.by, `${dayLabel(at)} ${time(at)}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              {photo.tag !== "NONE" && <Badge variant="default">{photo.tag === "BEFORE" ? "Before" : "After"}</Badge>}
            </div>
            {canChange(photo.byId) && (
              <div className="flex gap-2 pb-3">
                <Button variant="ghost" className="flex-1 text-white hover:bg-white/10" onClick={() => setEditing(true)}>
                  <Icon name="edit" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1 text-red-300 hover:bg-white/10"
                  disabled={action.busy}
                  onClick={async () => {
                    if (!window.confirm("Delete this photo?")) return;
                    if (await action.run(() => api(`/photos/${photo.id}`, { method: "DELETE" }))) {
                      onChanged();
                      setIndex(photos.length > 1 ? Math.max(0, index - 1) : null);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
