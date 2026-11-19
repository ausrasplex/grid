"use client";

// A shared plan link (/s/<token>, docs/plans-block.md "Sharing plans"), for
// someone without Grid: the sheets on the link, each at its current
// revision with the chosen layers drawn on. Pinch and drag to zoom, like
// the viewer inside Grid, but nothing can be changed. Download PDF when
// the link allows it.

import { useEffect, useRef, useState } from "react";
import type OpenSeadragonType from "openseadragon";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileStack, Loader2, Maximize, Minus, Plus } from "lucide-react";
import { Button, cn } from "@grid/ui";

export interface SharedPlansJson {
  token: string;
  business: string;
  job: string;
  name: string;
  allowDownload: boolean;
  expiresAt: string | null;
  sheets: {
    id: string;
    number: string;
    title: string;
    revision: string;
    revisionDate: string;
    versionId: string;
    widthPx: number | null;
    heightPx: number | null;
    ready: boolean;
  }[];
}

const day = (date: string) => new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function SharedPlans({ view }: { view: SharedPlansJson }) {
  const only = view.sheets.length === 1 ? view.sheets[0]!.id : null;
  const [openId, setOpenId] = useState<string | null>(only);
  const base = `/api/public/plans/s/${view.token}`;

  // The phone's back button closes a sheet (back to the list).
  useEffect(() => {
    if (only) return;
    const onPop = () => setOpenId(new URLSearchParams(window.location.hash.slice(1)).get("sheet"));
    onPop();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [only]);
  const open = (id: string | null) => {
    if (only) return;
    window.history.pushState(null, "", id ? `#sheet=${id}` : window.location.pathname);
    setOpenId(id);
  };

  const sheet = view.sheets.find((entry) => entry.id === openId) ?? null;
  if (sheet) {
    const position = view.sheets.indexOf(sheet);
    return (
      <SharedViewer
        base={base}
        sheet={sheet}
        business={view.business}
        allowDownload={view.allowDownload}
        onBack={only ? null : () => window.history.back()}
        prev={view.sheets[position - 1] ?? null}
        next={view.sheets[position + 1] ?? null}
        onGo={(id) => {
          window.history.replaceState(null, "", `#sheet=${id}`);
          setOpenId(id);
        }}
      />
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:py-10">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-muted-foreground">{view.business}</p>
        <h1 className="text-2xl font-bold">Plans for {view.job}</h1>
        <p className="text-sm text-muted-foreground">
          Shared with {view.name}. Always the current revision of each sheet{view.expiresAt ? `. This link works until ${day(view.expiresAt)}.` : "."}
        </p>
      </header>
      {view.allowDownload && view.sheets.length > 1 && (
        <Button asChild variant="outline" size="lg" className="self-start">
          <a href={`${base}/pdf`} download>
            <Download /> Download all as PDF
          </a>
        </Button>
      )}
      {view.sheets.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {view.sheets.map((entry) => (
            <li key={entry.id}>
              <button type="button" onClick={() => open(entry.id)} className="flex w-full min-h-touch-lg items-center gap-3 rounded-xl bg-card p-3 text-left shadow-sm hover:bg-muted">
                {entry.ready ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${base}/${entry.id}/tiles/${entry.versionId}/thumb.jpg`} alt="" className="size-16 shrink-0 rounded-md border bg-white object-contain" loading="lazy" />
                ) : (
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-md border">
                    <FileStack className="size-6 text-muted-foreground" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{entry.number}</span>
                  <span className="block truncate text-sm text-muted-foreground">{entry.title || "Plan sheet"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {entry.revision ? `Rev ${entry.revision} · ` : ""}
                    {day(entry.revisionDate)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-card p-4 text-sm">The sheets on this link have been removed. Ask {view.business} for a new link.</p>
      )}
      <p className="text-xs text-muted-foreground">Shared from Grid. Only the people with this link can see these plans.</p>
    </main>
  );
}

function SharedViewer({
  base,
  sheet,
  business,
  allowDownload,
  onBack,
  prev,
  next,
  onGo,
}: {
  base: string;
  sheet: SharedPlansJson["sheets"][number];
  business: string;
  allowDownload: boolean;
  onBack: (() => void) | null;
  prev: { id: string; number: string } | null;
  next: { id: string; number: string } | null;
  onGo: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<OpenSeadragonType.Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [drawing, setDrawing] = useState("");

  // The layers' drawing: SVG in sheet units, made by Grid's server.
  useEffect(() => {
    let alive = true;
    setDrawing("");
    void fetch(`${base}/${sheet.id}/drawing`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { svg: string } | null) => alive && result && setDrawing(result.svg))
      .catch(() => {});
    return () => void (alive = false);
  }, [base, sheet.id]);

  useEffect(() => {
    if (!sheet.ready || !box.current) return;
    let alive = true;
    setLoading(true);
    void import("openseadragon").then(({ default: OSD }) => {
      if (!alive || !box.current) return;
      const zoomViewer = OSD({
        element: box.current,
        tileSources: `${base}/${sheet.id}/tiles/${sheet.versionId}/plan.dzi`,
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
      let frame = 0;
      const measure = () => {
        frame = 0;
        const bounds = zoomViewer.viewport.getBoundsNoRotate(true);
        const size = zoomViewer.viewport.getContainerSize();
        if (!bounds.width || !size.x) return;
        setView({ x: bounds.x, y: bounds.y, scale: size.x / bounds.width });
      };
      const schedule = () => void (frame ||= requestAnimationFrame(measure));
      for (const name of ["open", "update-viewport", "resize"] as const) zoomViewer.addHandler(name, schedule);
    });
    return () => {
      alive = false;
      viewer.current?.destroy();
      viewer.current = null;
    };
  }, [base, sheet.id, sheet.versionId, sheet.ready]);

  const zoom = (factor: number) => viewer.current?.viewport.zoomBy(factor).applyConstraints();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-800 text-white">
      <header className="flex items-center gap-1 border-b border-white/10 bg-neutral-900 px-2 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
        {onBack && (
          <button type="button" onClick={onBack} className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10" aria-label="All sheets">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <div className="flex min-h-11 min-w-0 flex-1 flex-col justify-center px-2">
          <span className="truncate font-bold leading-tight">
            {sheet.number}
            {sheet.revision && <span className="font-semibold text-white/70"> · Rev {sheet.revision}</span>}
          </span>
          <span className="truncate text-xs text-white/70">{[sheet.title, business].filter(Boolean).join(" · ")}</span>
        </div>
        {onBack && (
          <>
            <button type="button" disabled={!prev} onClick={() => prev && onGo(prev.id)} className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-30" aria-label={prev ? `Previous sheet ${prev.number}` : "No previous sheet"}>
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" disabled={!next} onClick={() => next && onGo(next.id)} className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-30" aria-label={next ? `Next sheet ${next.number}` : "No next sheet"}>
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
        {allowDownload && (
          <a href={`${base}/${sheet.id}/pdf`} download className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold hover:bg-white/10" aria-label={`Download ${sheet.number} as PDF`}>
            <Download className="size-5" />
            <span className="hidden sm:inline">PDF</span>
          </a>
        )}
      </header>

      <main className="relative min-h-0 flex-1">
        {sheet.ready ? (
          <>
            <div ref={box} className="absolute inset-0" aria-label={`Plan ${sheet.number}`} role="img" />
            {drawing && (
              <svg className="pointer-events-none absolute inset-0 size-full overflow-hidden" aria-hidden="true">
                {/* Grid's own drawing from the server (text escaped; uploaded icons only ever as pictures). */}
                <g transform={`scale(${view.scale}) translate(${-view.x} ${-view.y})`} dangerouslySetInnerHTML={{ __html: drawing }} />
              </svg>
            )}
            {loading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-8 animate-spin text-white/70" />
              </div>
            )}
            <div className="absolute right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-2">
              {[
                { icon: <Plus className="size-5" />, label: "Zoom in", on: () => zoom(1.6) },
                { icon: <Minus className="size-5" />, label: "Zoom out", on: () => zoom(1 / 1.6) },
                { icon: <Maximize className="size-5" />, label: "Whole sheet", on: () => viewer.current?.viewport.goHome() },
              ].map((button) => (
                <button key={button.label} type="button" onClick={button.on} aria-label={button.label} className="flex size-12 items-center justify-center rounded-full bg-neutral-900/90 shadow-lg hover:bg-neutral-700">
                  {button.icon}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className={cn("flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-white/80")}>
            <Loader2 className="size-8 animate-spin" />
            <p>This sheet is still being prepared. Try again in a minute.</p>
          </div>
        )}
      </main>
    </div>
  );
}
