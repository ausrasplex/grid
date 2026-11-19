"use client";

// The plan viewer: the whole screen for the drawing, pinch and drag to
// zoom right into the fine print. Deep-zoom tiles, so a phone only ever
// loads the part you're looking at. Prev/next walk the set; the revision
// chip shows every upload of the sheet.
//
// Other Blocks draw over the sheet through the plan overlay (@grid/ui):
// markups, measuring, photo pins. The viewer tells them where the view is,
// passes taps on to the tool in use, and holds the tool bar under the plan.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LEVEL_NAMES, PLAN_LEVELS, PLAN_LEVEL_DISK, PLAN_LEVEL_SIZES, type PlanLevel } from "@grid/db/render-levels";
import type OpenSeadragonType from "openseadragon";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Eye, EyeOff, FileDown, Info, Layers, Loader2, Maximize, Minus, Plus, RotateCw } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Field,
  FormActions,
  PlanOverlayProvider,
  Scroller,
  SelectField,
  Sheet,
  SheetContent,
  api,
  cn,
  useAction,
  type PlanOverlayValue,
  type PlanPointer,
  type PlanView,
} from "@grid/ui";
import { DISCIPLINES, disciplineName } from "../parse";
import { LayersPanel, useSheetLayers, type LayerJson } from "./Layers";

export interface SheetJson {
  id: string;
  projectId: string;
  number: string;
  title: string;
  discipline: string;
  disciplineName: string;
  buildingId: string | null;
  levelId: string | null;
  /** This sheet's own sharpness, or null for the server's (serverQuality). */
  quality: PlanLevel | null;
  serverQuality: PlanLevel;
  /** The job is archived: tiles are drawn again for a quick look when opened. */
  archived: boolean;
  currentVersionId: string | null;
  versions: {
    id: string;
    revision: string;
    status: "PENDING" | "READY" | "FAILED";
    /** Archived job: the tiles were dropped (the thumbnail stays). */
    dropped: boolean;
    error: string | null;
    widthPx: number | null;
    heightPx: number | null;
    dpi: number | null;
    pageWidthPt: number | null;
    pageHeightPt: number | null;
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

export function Viewer({
  sheet: initial,
  versionId,
  jobName,
  areas,
  permissions,
  layers: initialLayers = [],
  overlays = [],
}: {
  sheet: SheetJson;
  versionId: string | null;
  jobName: string;
  areas: AreaJson[];
  permissions: { manage: boolean; upload: boolean; layers: boolean };
  /** The sheet's layers (Default has no row). */
  layers?: LayerJson[];
  /** Other Blocks' "plans.viewer" panels: markups, photo pins. */
  overlays?: ReactNode[];
}) {
  const [sheet, setSheet] = useState(initial);
  const [viewingId, setViewingId] = useState(versionId ?? initial.currentVersionId);
  const version = sheet.versions.find((version) => version.id === viewingId) ?? sheet.versions[0];
  // Tiles to show: drawn, and not dropped for an archived job.
  const ready = version?.status === "READY" && !version.dropped;
  const isCurrent = version?.id === sheet.currentVersionId;
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<OpenSeadragonType.Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<"info" | "revs" | "set" | "layers" | "pdf" | null>(null);
  const layerState = useSheetLayers(initial.id, initialLayers);
  const activeLayerName = layerState.layers.find((layer) => layer.id === layerState.active)?.name ?? "Default";

  // The overlay: where the view is, the tool in use, and who's listening for taps.
  const [view, setView] = useState<PlanView>({ x: 0, y: 0, scale: 1, width: 0, height: 0 });
  const [tool, setToolState] = useState<string | null>(null);
  const toolRef = useRef<string | null>(null);
  // A tap-only tool (icons, pins, point-to-point measuring) leaves dragging to pan the plan.
  const tapsOnlyRef = useRef(false);
  const setTool = useCallback((next: string | null, options?: { tapsOnly?: boolean }) => {
    toolRef.current = next;
    tapsOnlyRef.current = !!next && !!options?.tapsOnly;
    setToolState(next);
  }, []);
  const [hidden, setHidden] = useState(false);
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const listeners = useRef(new Set<(pointer: PlanPointer) => void>());
  const onPointer = useCallback((listener: (pointer: PlanPointer) => void) => {
    listeners.current.add(listener);
    return () => void listeners.current.delete(listener);
  }, []);

  const reload = async () => {
    const latest = await api<SheetJson>(`/plans/sheet/${sheet.id}`);
    setSheet(latest);
    return latest;
  };

  // Archived job: say this revision was opened, which draws it again if its tiles were dropped.
  useEffect(() => {
    if (!sheet.archived || !version) return;
    void api<{ status: string }>(`/plans/version/${version.id}/open`, { body: {} })
      .then((opened) => (version.dropped || opened.status !== version.status ? reload() : undefined))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.archived, version?.id]);

  // Still being prepared: check every few seconds.
  useEffect(() => {
    if (version?.status !== "PENDING") return;
    const timer = setInterval(() => void reload().catch(() => {}), 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.status, version?.id]);

  // The viewer itself.
  useEffect(() => {
    if (!version || !ready || !box.current) return;
    let alive = true;
    setLoading(true);
    void import("openseadragon").then(({ default: OSD }) => {
      if (!alive || !box.current) return;
      const zoomViewer = OSD({
        element: box.current,
        tileSources: `/api/plans/tiles/${version.id}/${version.widthPx ?? 0}/plan.dzi`,
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

      // Keep the overlay lined up with the sheet, once per frame at most.
      let frame = 0;
      const measure = () => {
        frame = 0;
        const bounds = zoomViewer.viewport.getBoundsNoRotate(true);
        const size = zoomViewer.viewport.getContainerSize();
        if (!bounds.width || !size.x) return;
        setView({ x: bounds.x, y: bounds.y, scale: size.x / bounds.width, width: size.x, height: size.y });
      };
      const schedule = () => void (frame ||= requestAnimationFrame(measure));
      for (const name of ["open", "update-viewport", "resize"] as const) zoomViewer.addHandler(name, schedule);

      // Taps and strokes go to the tool in use. While one's picked, a
      // one-finger drag draws instead of panning (unless the tool only uses
      // taps); two fingers still zoom.
      // With no tool, a press can still be claimed (a corner handle), and
      // then that drag moves the handle instead of the plan.
      type CanvasEvent = { position: OpenSeadragonType.Point; preventDefaultAction?: boolean; quick?: boolean };
      let claimed = false;
      let swallowClick = false;
      const send = (kind: PlanPointer["kind"], event: CanvasEvent, extra: Partial<PlanPointer> = {}) => {
        const point = zoomViewer.viewport.pointFromPixel(event.position, true);
        for (const listener of listeners.current) listener({ kind, point: [point.x, point.y], screen: [event.position.x, event.position.y], ...extra });
      };
      const active = () => (!!toolRef.current && !tapsOnlyRef.current) || claimed;
      const whileActive = (kind: PlanPointer["kind"], stopDefault: boolean) => (event: unknown) => {
        if (!active()) return;
        if (stopDefault) (event as CanvasEvent).preventDefaultAction = true;
        send(kind, event as CanvasEvent);
      };
      const on = (name: string, handler: (event: unknown) => void) => zoomViewer.addHandler(name as "canvas-press", handler as never);
      on("canvas-press", (event) => {
        claimed = false;
        swallowClick = false;
        send("press", event as CanvasEvent, { claim: () => void (claimed = true) });
      });
      on("canvas-drag", whileActive("drag", true));
      on("canvas-drag-end", (event) => {
        if (active()) (event as CanvasEvent).preventDefaultAction = true;
      });
      on("canvas-release", (event) => {
        whileActive("release", false)(event);
        if (claimed) swallowClick = true;
        claimed = false;
      });
      on("canvas-double-click", (event) => {
        if (!toolRef.current) return;
        (event as CanvasEvent).preventDefaultAction = true;
        send("double", event as CanvasEvent);
      });
      on("canvas-pinch", (event) => {
        if (!active()) return;
        send("cancel", event as CanvasEvent);
        claimed = false;
      });
      on("canvas-click", (event) => {
        const canvasEvent = event as CanvasEvent;
        if (swallowClick) {
          swallowClick = false;
          canvasEvent.preventDefaultAction = true;
          return;
        }
        if (!canvasEvent.quick) return;
        if (toolRef.current) canvasEvent.preventDefaultAction = true;
        send("click", canvasEvent);
      });
    });
    return () => {
      alive = false;
      viewer.current?.destroy();
      viewer.current = null;
    };
  }, [version?.id, ready]);

  // Arrow keys walk the set; +/- zoom.
  useEffect(() => {
    const onKey = (keyboardEvent: KeyboardEvent) => {
      if ((keyboardEvent.target as HTMLElement)?.closest("input,textarea,select,[role=dialog]")) return;
      if (keyboardEvent.key === "Escape" && toolRef.current) setTool(null);
      if (keyboardEvent.key === "ArrowLeft" && keyboardEvent.altKey && sheet.prev) window.location.href = `/plans/sheet/${sheet.prev.id}`;
      if (keyboardEvent.key === "ArrowRight" && keyboardEvent.altKey && sheet.next) window.location.href = `/plans/sheet/${sheet.next.id}`;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet.prev, sheet.next, setTool]);

  const zoom = (factor: number) => viewer.current?.viewport.zoomBy(factor).applyConstraints();
  const home = () => viewer.current?.viewport.goHome();

  // Put the tool down when you switch revision.
  useEffect(() => setTool(null), [version?.id, setTool]);

  const overlay = useMemo<PlanOverlayValue | null>(() => {
    if (!version) return null;
    const info = (entry: SheetJson["versions"][number]) => ({
      id: entry.id,
      revision: entry.revision,
      createdAt: entry.createdAt,
      widthPx: entry.widthPx,
      heightPx: entry.heightPx,
      dpi: entry.dpi,
      pageWidthPt: entry.pageWidthPt,
      pageHeightPt: entry.pageHeightPt,
    });
    return {
      sheet: { id: sheet.id, projectId: sheet.projectId, number: sheet.number, buildingId: sheet.buildingId, levelId: sheet.levelId },
      version: info(version),
      versions: sheet.versions.map(info),
      isCurrent,
      aspect: version.widthPx && version.heightPx ? version.heightPx / version.widthPx : 1,
      view,
      tool,
      setTool,
      hidden,
      activeLayerId: layerState.active,
      layerShown: layerState.layerShown,
      layers: layerState.layers,
      onPointer,
      toolbar,
    };
  }, [sheet, version, isCurrent, view, tool, setTool, hidden, layerState.active, layerState.layerShown, layerState.layers, onPointer, toolbar]);
  const showOverlays = overlays.length > 0 && ready && overlay !== null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-800 text-white">
      <header className="flex items-center gap-1 border-b border-white/10 bg-neutral-900 px-2 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
        <a href={`/plans/job/${sheet.projectId}`} className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10" aria-label={`Back to plans for ${jobName}`}>
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
          href={sheet.prev ? `/plans/sheet/${sheet.prev.id}` : undefined}
          aria-disabled={!sheet.prev}
          className={cn("flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10", !sheet.prev && "pointer-events-none opacity-30")}
          aria-label={sheet.prev ? `Previous sheet ${sheet.prev.number}` : "No previous sheet"}
        >
          <ChevronLeft className="size-5" />
        </a>
        <a
          href={sheet.next ? `/plans/sheet/${sheet.next.id}` : undefined}
          aria-disabled={!sheet.next}
          className={cn("flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10", !sheet.next && "pointer-events-none opacity-30")}
          aria-label={sheet.next ? `Next sheet ${sheet.next.number}` : "No next sheet"}
        >
          <ChevronRight className="size-5" />
        </a>
        {version && (
          <button type="button" onClick={() => setPanel("pdf")} className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10" aria-label="Download PDF">
            <FileDown className="size-5" />
          </button>
        )}
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
        {ready ? (
          <>
            <div ref={box} className={cn("absolute inset-0", tool && "cursor-crosshair")} aria-label={`Plan ${sheet.number}`} role="img" />
            {showOverlays && (
              <PlanOverlayProvider value={overlay}>
                <div className="pointer-events-none absolute inset-0 overflow-hidden">{overlays}</div>
              </PlanOverlayProvider>
            )}
            {loading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-8 animate-spin text-white/70" />
              </div>
            )}
            <div className="absolute right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-2">
              {[
                ...(showOverlays
                  ? [
                      { icon: <Layers className="size-5" />, label: "Layers", on: () => setPanel("layers"), badge: layerState.hiddenCount || null },
                      { icon: hidden ? <EyeOff className="size-5" /> : <Eye className="size-5" />, label: hidden ? "Show markups and pins" : "Hide markups and pins", on: () => setHidden(!hidden) },
                    ]
                  : []),
                { icon: <Plus className="size-5" />, label: "Zoom in", on: () => zoom(1.6) },
                { icon: <Minus className="size-5" />, label: "Zoom out", on: () => zoom(1 / 1.6) },
                { icon: <Maximize className="size-5" />, label: "Whole sheet", on: home },
              ].map((button) => (
                <button key={button.label} type="button" onClick={button.on} aria-label={button.label} className="relative flex size-12 items-center justify-center rounded-full bg-neutral-900/90 shadow-lg hover:bg-neutral-700">
                  {button.icon}
                  {"badge" in button && button.badge ? (
                    <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground" aria-label={`${button.badge} off`}>
                      {button.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {/* The layer new things go on, when there's more than Default. */}
            {showOverlays && layerState.layers.length > 0 && (
              <button
                type="button"
                onClick={() => setPanel("layers")}
                className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 flex min-h-11 max-w-[60%] items-center gap-2 rounded-full bg-neutral-900/90 px-3 text-sm shadow-lg hover:bg-neutral-700"
                aria-label={`Drawing on ${activeLayerName}. Change layer`}
              >
                <Layers className="size-4 shrink-0 text-primary" />
                <span className="truncate">{activeLayerName}</span>
              </button>
            )}
          </>
        ) : version?.status === "FAILED" ? (
          <Failed versionId={version.id} error={version.error} canRetry={permissions.upload} onRetry={reload} />
        ) : version ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-white/80">
            <Loader2 className="size-8 animate-spin" />
            <p>{sheet.archived ? "Getting this sheet ready. This job is archived, so it's drawn again for a quick look: a few seconds, longer for a big or very sharp sheet." : "Preparing the sheet for zooming. Big sets take a minute."}</p>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-white/80">This sheet has no uploads.</div>
        )}
      </main>

      {showOverlays && (
        <footer className="border-t border-white/10 bg-neutral-900 pb-[env(safe-area-inset-bottom)] [&:has([data-tools]:empty)]:hidden">
          <Scroller axis="x">
            <div ref={setToolbar} data-tools="" className="mx-auto flex w-max items-center gap-1 px-2 py-1" />
          </Scroller>
        </footer>
      )}

      <Sheet open={panel === "set"} onOpenChange={(open) => !open && setPanel(null)}>
        <SheetContent title="Sheets" description={jobName}>
          <ul className="divide-y rounded-lg border">
            {sheet.set.map((entry) => (
              <li key={entry.id}>
                <a href={`/plans/sheet/${entry.id}`} aria-current={entry.id === sheet.id ? "page" : undefined} className={cn("flex min-h-touch-lg flex-col justify-center px-3 py-2 hover:bg-muted", entry.id === sheet.id && "bg-muted")}>
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

      <Sheet open={panel === "layers"} onOpenChange={(open) => !open && setPanel(null)}>
        <SheetContent title="Layers" description={`On ${sheet.number}. Power, Data, Lighting; Water, Drainage.`}>
          <LayersPanel sheetId={sheet.id} state={layerState} canAdd={permissions.layers && isCurrent} />
        </SheetContent>
      </Sheet>

      <Sheet open={panel === "pdf"} onOpenChange={(open) => !open && setPanel(null)}>
        <SheetContent title="Download PDF" description={`${sheet.number}${version?.revision ? ` Rev ${version.revision}` : ""}: the original drawing with the layers you tick drawn on.`}>
          {version && panel === "pdf" && <PdfDownload sheetId={sheet.id} versionId={version.id} layers={layerState.layers} shown={layerState.layerShown} withMarkups={showOverlays} />}
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

/**
 * Download PDF (docs/plans-block.md "Plan PDFs"): the revision being
 * viewed, built from the original upload, with the ticked layers' markups
 * and icons drawn on. Starts with the layers you have showing.
 */
function PdfDownload({ sheetId, versionId, layers, shown, withMarkups }: { sheetId: string; versionId: string; layers: { id: string; name: string }[]; shown: (layerId: string | null) => boolean; withMarkups: boolean }) {
  const [withDefault, setWithDefault] = useState(() => shown(null));
  const [ticked, setTicked] = useState(() => new Set(layers.filter((layer) => shown(layer.id)).map((layer) => layer.id)));
  const [started, setStarted] = useState(false);
  const query = new URLSearchParams({ version: versionId, layers: [...ticked].join(","), default: withMarkups && withDefault ? "1" : "0" });
  if (!withMarkups) query.set("layers", "");
  const tick = "mt-0.5 size-5 shrink-0 accent-primary";
  return (
    <div className="flex flex-col gap-3">
      {withMarkups && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">Markups and icons on these layers</legend>
          <label className="flex min-h-touch items-start gap-3 text-sm">
            <input type="checkbox" className={tick} checked={withDefault} onChange={() => setWithDefault(!withDefault)} />
            <span>Default</span>
          </label>
          {layers.map((layer) => (
            <label key={layer.id} className="flex min-h-touch items-start gap-3 text-sm">
              <input
                type="checkbox"
                className={tick}
                checked={ticked.has(layer.id)}
                onChange={() =>
                  setTicked((current) => {
                    const next = new Set(current);
                    if (next.has(layer.id)) next.delete(layer.id);
                    else next.add(layer.id);
                    return next;
                  })
                }
              />
              <span>{layer.name}</span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">Untick them all for the clean drawing. &quot;Just me&quot; markups and photo pins aren&apos;t included.</p>
        </fieldset>
      )}
      {started && <p className="text-sm text-muted-foreground">Making the PDF. A big sheet with lots of markups can take a few seconds.</p>}
      <FormActions>
        <Button asChild size="lg">
          <a href={`/api/plans/sheet/${sheetId}/pdf?${query}`} download onClick={() => setStarted(true)}>
            <Download /> Download PDF
          </a>
        </Button>
      </FormActions>
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
  const [form, setForm] = useState({
    number: sheet.number,
    title: sheet.title,
    discipline: sheet.discipline,
    area: sheet.buildingId ? `${sheet.buildingId}:${sheet.levelId ?? ""}` : "",
    quality: (sheet.quality ?? "") as PlanLevel | "",
  });
  const shownAt = version?.dpi ? `Shown at ${version.dpi} dpi (${version.widthPx} × ${version.heightPx} px).` : null;
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
        {shownAt && (
          <>
            <dt className="text-muted-foreground">Sharpness</dt>
            <dd>
              {LEVEL_NAMES[sheet.quality ?? sheet.serverQuality]}. {shownAt}
            </dd>
          </>
        )}
      </dl>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const [buildingId, levelId] = form.area ? form.area.split(":") : [null, null];
        const result = await action.run(async () => {
          await api(`/plans/sheet/${sheet.id}`, { method: "PATCH", body: { number: form.number, title: form.title, discipline: form.discipline, buildingId: buildingId || null, levelId: levelId || null } });
          // A different sharpness draws every revision again.
          if ((form.quality || null) !== sheet.quality) await api(`/plans/sheet/${sheet.id}/quality`, { method: "PUT", body: { quality: form.quality || null } });
          return true;
        });
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
      <SelectField
        label="Sharpness"
        hint={
          form.quality && form.quality !== (sheet.quality ?? "")
            ? `Every revision of this sheet is drawn again at ${LEVEL_NAMES[form.quality]} (${PLAN_LEVEL_SIZES[form.quality].dpi} dpi). Takes ${form.quality === "EXTREME" ? "up to a few minutes" : "a minute or so"}; uses ${PLAN_LEVEL_DISK[form.quality]}.`
            : `For a sheet with tiny text, like a switchboard schedule or riser. ${shownAt ?? ""}`
        }
        value={form.quality}
        onChange={(event) => setForm({ ...form, quality: event.target.value as PlanLevel | "" })}
        options={[
          { value: "", label: `Server setting (${LEVEL_NAMES[sheet.serverQuality]})` },
          ...PLAN_LEVELS.map((level) => ({ value: level, label: `${LEVEL_NAMES[level]}, ${PLAN_LEVEL_SIZES[level].dpi} dpi` })),
        ]}
      />
      <Alert variant="error">{action.error}</Alert>
      <FormActions>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive"
          onClick={async () => {
            if (!window.confirm(`Delete ${sheet.number} and all its revisions? It stays in Recently deleted for a while.`)) return;
            const result = await action.run(() => api(`/plans/sheet/${sheet.id}`, { method: "DELETE" }));
            if (result) window.location.href = `/plans/job/${sheet.projectId}`;
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
