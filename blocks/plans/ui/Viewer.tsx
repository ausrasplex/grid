"use client";

// The plan viewer: the whole screen for the drawing, pinch and drag to
// zoom right into the fine print. Deep-zoom tiles, so a phone only ever
// loads the part you're looking at. Prev/next walk the set; the revision
// chip shows every upload of the sheet.

import { useEffect, useRef, useState } from "react";
import type OpenSeadragonType from "openseadragon";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Info, Loader2, Maximize, Minus, Plus, RotateCw } from "lucide-react";
import { Alert, Badge, Button, Field, FormActions, SelectField, Sheet, SheetContent, api, cn, useAction } from "@grid/ui";
import { DISCIPLINES, disciplineName } from "../parse";

export interface SheetJson {
  id: string;
  projectId: string;
  number: string;
  title: string;
  discipline: string;
  disciplineName: string;
  buildingId: string | null;
  levelId: string | null;
  currentVersionId: string | null;
  versions: {
    id: string;
    revision: string;
    status: "PENDING" | "READY" | "FAILED";
    error: string | null;
    widthPx: number | null;
    heightPx: number | null;
    dpi: number | null;
    page: number;
    fileId: string;
    note: string | null;
    createdAt: string;
    uploadedBy: string;
    fileName: string | null;
    fileIsPdf: boolean;
  }[];
  prev: { id: string; number: string } | null;
  next: { id: string; number: string } | null;
  set: { id: string; number: string; title: string; discipline: string }[];
}

export interface AreaJson {
  buildingId: string;
  levelId: string | null;
  label: string;
}

const day = (date: string) => new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function Viewer({ sheet: initial, versionId, jobName, areas, permissions }: { sheet: SheetJson; versionId: string | null; jobName: string; areas: AreaJson[]; permissions: { manage: boolean; upload: boolean } }) {
  const [sheet, setSheet] = useState(initial);
  const [viewingId, setViewingId] = useState(versionId ?? initial.currentVersionId);
  const version = sheet.versions.find((version) => version.id === viewingId) ?? sheet.versions[0];
  const isCurrent = version?.id === sheet.currentVersionId;
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<OpenSeadragonType.Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<"info" | "revs" | "set" | null>(null);

  const reload = async () => {
    const latest = await api<SheetJson>(`/plans/sheet/${sheet.id}`);
    setSheet(latest);
    return latest;
  };

  // Still being prepared: check every few seconds.
  useEffect(() => {
    if (version?.status !== "PENDING") return;
    const timer = setInterval(() => void reload().catch(() => {}), 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.status, version?.id]);

  // The viewer itself.
  useEffect(() => {
    if (!version || version.status !== "READY" || !box.current) return;
    let alive = true;
    setLoading(true);
    void import("openseadragon").then(({ default: OSD }) => {
      if (!alive || !box.current) return;
      const zoomViewer = OSD({
        element: box.current,
        tileSources: `/api/plans/tiles/${version.id}/plan.dzi`,
        showNavigationControl: false,
        showNavigator: false,
        animationTime: 0.35,
        blendTime: 0,
        springStiffness: 9,
        maxZoomPixelRatio: 3,
        minZoomImageRatio: 0.7,
        visibilityRatio: 0.25,
        imageLoaderLimit: 6,
        timeout: 60_000,
        preserveImageSizeOnResize: true,
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true, scrollToZoom: true },
        gestureSettingsTouch: { pinchRotate: false, dblClickToZoom: true, flickEnabled: true },
      });
      zoomViewer.addOnceHandler("tile-loaded", () => setLoading(false));
      zoomViewer.addHandler("open-failed", () => setLoading(false));
      viewer.current = zoomViewer;
    });
    return () => {
      alive = false;
      viewer.current?.destroy();
      viewer.current = null;
    };
  }, [version?.id, version?.status]);

  // Arrow keys walk the set; +/- zoom.
  useEffect(() => {
    const onKey = (keyboardEvent: KeyboardEvent) => {
      if ((keyboardEvent.target as HTMLElement)?.closest("input,textarea,select,[role=dialog]")) return;
      if (keyboardEvent.key === "ArrowLeft" && keyboardEvent.altKey && sheet.prev) window.location.href = `/b/plans/sheet/${sheet.prev.id}`;
      if (keyboardEvent.key === "ArrowRight" && keyboardEvent.altKey && sheet.next) window.location.href = `/b/plans/sheet/${sheet.next.id}`;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet.prev, sheet.next]);

  const zoom = (factor: number) => viewer.current?.viewport.zoomBy(factor).applyConstraints();
  const home = () => viewer.current?.viewport.goHome();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-800 text-white">
      <header className="flex items-center gap-1 border-b border-white/10 bg-neutral-900 px-2 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
        <a href={`/b/plans/job/${sheet.projectId}`} className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10" aria-label={`Back to plans for ${jobName}`}>
          <ArrowLeft className="size-5" />
        </a>
        <button type="button" onClick={() => setPanel("set")} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-md px-2 text-left hover:bg-white/10" aria-label="Choose a sheet">
          <span className="truncate font-bold leading-tight">{sheet.number}</span>
          <span className="truncate text-xs text-white/70">{sheet.title || sheet.disciplineName}</span>
        </button>
        {version && (
          <button
            type="button"
            onClick={() => setPanel("revs")}
            className={cn("min-h-11 shrink-0 rounded-md px-2.5 text-sm font-semibold", isCurrent ? "bg-white/10 hover:bg-white/20" : "bg-amber-500 text-black hover:bg-amber-400")}
            aria-label="Revisions"
          >
            {version.revision ? `Rev ${version.revision}` : "Revisions"}
            {sheet.versions.length > 1 && <span className="opacity-70"> · {sheet.versions.length}</span>}
          </button>
        )}
        <a
          href={sheet.prev ? `/b/plans/sheet/${sheet.prev.id}` : undefined}
          aria-disabled={!sheet.prev}
          className={cn("flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10", !sheet.prev && "pointer-events-none opacity-30")}
          aria-label={sheet.prev ? `Previous sheet ${sheet.prev.number}` : "No previous sheet"}
        >
          <ChevronLeft className="size-5" />
        </a>
        <a
          href={sheet.next ? `/b/plans/sheet/${sheet.next.id}` : undefined}
          aria-disabled={!sheet.next}
          className={cn("flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10", !sheet.next && "pointer-events-none opacity-30")}
          aria-label={sheet.next ? `Next sheet ${sheet.next.number}` : "No next sheet"}
        >
          <ChevronRight className="size-5" />
        </a>
        <button type="button" onClick={() => setPanel("info")} className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10" aria-label="Sheet details">
          <Info className="size-5" />
        </button>
      </header>

      {version && !isCurrent && (
        <div className="flex items-center justify-between gap-2 bg-amber-500 px-3 py-1.5 text-sm text-black">
          <span>
            <strong>Not the current revision.</strong> {sheet.versions.find((version) => version.id === sheet.currentVersionId)?.revision ? `Current is Rev ${sheet.versions.find((version) => version.id === sheet.currentVersionId)!.revision}.` : ""}
          </span>
          <button type="button" className="shrink-0 font-semibold underline" onClick={() => setViewingId(sheet.currentVersionId)}>
            View current
          </button>
        </div>
      )}

      <main className="relative min-h-0 flex-1">
        {version?.status === "READY" ? (
          <>
            <div ref={box} className="absolute inset-0" aria-label={`Plan ${sheet.number}`} role="img" />
            {loading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-8 animate-spin text-white/70" />
              </div>
            )}
            <div className="absolute right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-2">
              {[
                { icon: <Plus className="size-5" />, label: "Zoom in", on: () => zoom(1.6) },
                { icon: <Minus className="size-5" />, label: "Zoom out", on: () => zoom(1 / 1.6) },
                { icon: <Maximize className="size-5" />, label: "Whole sheet", on: home },
              ].map((button) => (
                <button key={button.label} type="button" onClick={button.on} aria-label={button.label} className="flex size-12 items-center justify-center rounded-full bg-neutral-900/90 shadow-lg hover:bg-neutral-700">
                  {button.icon}
                </button>
              ))}
            </div>
          </>
        ) : version?.status === "FAILED" ? (
          <Failed versionId={version.id} error={version.error} canRetry={permissions.upload} onRetry={reload} />
        ) : version ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-white/80">
            <Loader2 className="size-8 animate-spin" />
            <p>Preparing the sheet for zooming. Big sets take a minute.</p>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-white/80">This sheet has no uploads.</div>
        )}
      </main>

      <Sheet open={panel === "set"} onOpenChange={(open) => !open && setPanel(null)}>
        <SheetContent title="Sheets" description={jobName}>
          <ul className="divide-y rounded-lg border">
            {sheet.set.map((entry) => (
              <li key={entry.id}>
                <a href={`/b/plans/sheet/${entry.id}`} aria-current={entry.id === sheet.id ? "page" : undefined} className={cn("flex min-h-touch-lg flex-col justify-center px-3 py-2 hover:bg-muted", entry.id === sheet.id && "bg-muted")}>
                  <span className="font-semibold">{entry.number}</span>
                  <span className="truncate text-sm text-muted-foreground">{entry.title || disciplineName(entry.discipline)}</span>
                </a>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      <Sheet open={panel === "revs"} onOpenChange={(open) => !open && setPanel(null)}>
        <SheetContent title={`Revisions of ${sheet.number}`} description="Newest first. The current one is what everyone sees first.">
          <Revisions sheet={sheet} viewing={version?.id ?? null} canManage={permissions.manage} onView={(id) => (setViewingId(id), setPanel(null))} onChanged={reload} />
        </SheetContent>
      </Sheet>

      <Sheet open={panel === "info"} onOpenChange={(open) => !open && setPanel(null)}>
        <SheetContent title="Sheet details">
          <SheetDetails sheet={sheet} areas={areas} canManage={permissions.manage} version={version ?? null} onSaved={async () => (await reload(), setPanel(null))} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Failed({ versionId, error, canRetry, onRetry }: { versionId: string; error: string | null; canRetry: boolean; onRetry: () => Promise<unknown> }) {
  const action = useAction();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-semibold">Grid couldn&apos;t read this sheet.</p>
      {error && <p className="text-sm text-white/70">{error}</p>}
      {canRetry && (
        <Button variant="outline" className="text-foreground" disabled={action.busy} onClick={() => void action.run(async () => (await api(`/plans/version/${versionId}/retry`, { body: {} }), await onRetry()))}>
          <RotateCw /> Try again
        </Button>
      )}
    </div>
  );
}

function Revisions({ sheet, viewing, canManage, onView, onChanged }: { sheet: SheetJson; viewing: string | null; canManage: boolean; onView: (id: string) => void; onChanged: () => Promise<unknown> }) {
  const action = useAction();
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y rounded-lg border">
        {sheet.versions.map((version) => {
          const current = version.id === sheet.currentVersionId;
          return (
            <li key={version.id} className={cn("flex flex-col gap-2 px-3 py-3", version.id === viewing && "bg-muted")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold">
                    {version.revision ? `Rev ${version.revision}` : "No revision"}
                    {current && <Badge variant="success">Current</Badge>}
                    {version.status === "PENDING" && <Badge variant="outline">Preparing</Badge>}
                    {version.status === "FAILED" && <Badge variant="destructive">Couldn&apos;t read</Badge>}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {day(version.createdAt)} · {version.uploadedBy}
                    {version.fileName && ` · ${version.fileName}${version.fileIsPdf && version.page > 1 ? ` p${version.page}` : ""}`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={version.id === viewing ? "secondary" : "outline"} onClick={() => onView(version.id)}>
                  View
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href={`/api/files/${version.fileId}`} target="_blank" rel="noopener">
                    <Download /> Original
                  </a>
                </Button>
                {canManage && !current && (
                  <Button size="sm" variant="outline" disabled={action.busy} onClick={() => void action.run(async () => (await api(`/plans/sheet/${sheet.id}/current`, { body: { versionId: version.id } }), await onChanged()))}>
                    Make current
                  </Button>
                )}
                {canManage && sheet.versions.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={action.busy}
                    onClick={() => {
                      if (!window.confirm(`Remove ${version.revision ? `Rev ${version.revision}` : "this upload"} of ${sheet.number}? Use this for an upload made by mistake.`)) return;
                      void action.run(async () => (await api(`/plans/version/${version.id}`, { method: "DELETE" }), await onChanged()));
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Alert variant="error">{action.error}</Alert>
      <p className="text-sm text-muted-foreground">To add a new revision, upload it from the job&apos;s plans. Grid matches it to this sheet by its number.</p>
    </div>
  );
}

function SheetDetails({ sheet, areas, canManage, version, onSaved }: { sheet: SheetJson; areas: AreaJson[]; canManage: boolean; version: SheetJson["versions"][number] | null; onSaved: () => Promise<unknown> }) {
  const [form, setForm] = useState({ number: sheet.number, title: sheet.title, discipline: sheet.discipline, area: sheet.buildingId ? `${sheet.buildingId}:${sheet.levelId ?? ""}` : "" });
  const action = useAction();
  const discOptions = [{ value: "", label: "Other" }, ...[...new Map(Object.entries(DISCIPLINES).map(([code, name]) => [name, code])).entries()].map(([name, code]) => ({ value: code, label: name }))];
  if (!canManage) {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Sheet</dt>
        <dd>{sheet.number}</dd>
        <dt className="text-muted-foreground">Title</dt>
        <dd>{sheet.title || "—"}</dd>
        <dt className="text-muted-foreground">Discipline</dt>
        <dd>{sheet.disciplineName}</dd>
      </dl>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const [buildingId, levelId] = form.area ? form.area.split(":") : [null, null];
        const result = await action.run(() =>
          api(`/plans/sheet/${sheet.id}`, { method: "PATCH", body: { number: form.number, title: form.title, discipline: form.discipline, buildingId: buildingId || null, levelId: levelId || null } }),
        );
        if (result) await onSaved();
      }}
    >
      <Field label="Sheet number" value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} required />
      <Field label="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
      <SelectField label="Discipline" value={form.discipline} onChange={(event) => setForm({ ...form, discipline: event.target.value })} options={discOptions} />
      {areas.length > 1 && (
        <SelectField
          label="Shows"
          hint="Pick the level this sheet is for, so it's offered when you're on that level."
          value={form.area}
          onChange={(event) => setForm({ ...form, area: event.target.value })}
          options={[{ value: "", label: "The whole job" }, ...areas.map((area) => ({ value: `${area.buildingId}:${area.levelId ?? ""}`, label: area.label }))]}
        />
      )}
      {version?.dpi && (
        <p className="text-xs text-muted-foreground">
          Shown at {version.dpi} dpi ({version.widthPx} × {version.heightPx} px).
        </p>
      )}
      <Alert variant="error">{action.error}</Alert>
      <FormActions>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive"
          onClick={async () => {
            if (!window.confirm(`Delete ${sheet.number} and all its revisions? It stays in Recently deleted for a while.`)) return;
            const result = await action.run(() => api(`/plans/sheet/${sheet.id}`, { method: "DELETE" }));
            if (result) window.location.href = `/b/plans/job/${sheet.projectId}`;
          }}
        >
          Delete sheet
        </Button>
        <Button type="submit" disabled={action.busy}>
          Save
        </Button>
      </FormActions>
    </form>
  );
}
