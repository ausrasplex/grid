"use client";

// The document viewer: pages one under another, on paper. Zoom with the
// buttons, Ctrl + scroll wheel or two fingers; jump to a page; see every
// page small and tap one to go there. Pages load as they come into view.

import { useEffect, useRef, useState } from "react";
import { LayoutGrid, Minus, Plus } from "lucide-react";
import { Button, Sheet, SheetContent, cn } from "@grid/ui";

export interface ViewerPage {
  src: string;
  width: number;
  height: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clamp = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));

export function PageViewer({ pages, title }: { pages: ViewerPage[]; title: string }) {
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const [grid, setGrid] = useState(false);
  const [jumping, setJumping] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Which page is on screen.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];
        if (visible) setCurrent(Number((visible.target as HTMLElement).dataset.page));
      },
      { threshold: [0.25, 0.5, 0.75] },
    );
    for (const element of pageRefs.current) if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [pages.length]);

  // Two-finger pinch and Ctrl + wheel zoom the pages, not the whole app.
  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    let start: { distance: number; zoom: number } | null = null;
    const distance = (touches: TouchList) => Math.hypot(touches[0]!.clientX - touches[1]!.clientX, touches[0]!.clientY - touches[1]!.clientY);
    const onStart = (event: TouchEvent) => {
      if (event.touches.length === 2) start = { distance: distance(event.touches), zoom: zoomRef.current };
    };
    const onMove = (event: TouchEvent) => {
      if (!start || event.touches.length !== 2) return;
      event.preventDefault();
      setZoom(clamp(start.zoom * (distance(event.touches) / start.distance)));
    };
    const onEnd = () => (start = null);
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((value) => clamp(value * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: false });
    element.addEventListener("touchend", onEnd);
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("wheel", onWheel);
    };
  }, []);

  const goTo = (page: number) => {
    const target = pageRefs.current[Math.min(pages.length, Math.max(1, page)) - 1];
    target?.scrollIntoView({ block: "start" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-3">
        {pages.length > 1 && (
          <>
            {jumping ? (
              <form
                className="flex items-center gap-2 text-sm"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = Number(new FormData(event.currentTarget).get("page"));
                  setJumping(false);
                  if (value) goTo(value);
                }}
              >
                <label className="flex items-center gap-2">
                  Page
                  <input name="page" type="number" inputMode="numeric" min={1} max={pages.length} defaultValue={current} autoFocus onBlur={() => setJumping(false)} className="h-10 w-20 rounded-md border border-input bg-card px-2 text-base" />
                </label>
                <span className="text-muted-foreground">of {pages.length}</span>
              </form>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setJumping(true)} aria-label={`Page ${current} of ${pages.length}. Go to a page`}>
                Page {current} of {pages.length}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setGrid(true)} aria-label="All pages">
              <LayoutGrid /> <span className="hidden sm:inline">Pages</span>
            </Button>
          </>
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="icon" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((value) => clamp(value / 1.25))}>
          <Minus />
        </Button>
        <button type="button" onClick={() => setZoom(1)} className="min-h-touch w-14 text-center text-sm font-semibold tabular-nums" aria-label="Fit to width">
          {Math.round(zoom * 100)}%
        </button>
        <Button variant="ghost" size="icon" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((value) => clamp(value * 1.25))}>
          <Plus />
        </Button>
      </div>

      <div ref={wrapper} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" style={{ touchAction: "pan-x pan-y" }}>
        <div className={cn("mx-auto flex flex-col gap-3", zoom === 1 && "max-w-4xl")} style={{ width: zoom === 1 ? undefined : `${zoom * 100}%` }}>
          {pages.map((page, index) => (
            <div key={page.src} ref={(element) => void (pageRefs.current[index] = element)} data-page={index + 1} className="paper scroll-mt-16 overflow-hidden rounded-md bg-white shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.src}
                alt={pages.length > 1 ? `${title}, page ${index + 1}` : title}
                loading={index < 2 ? "eager" : "lazy"}
                width={page.width || undefined}
                height={page.height || undefined}
                className="block h-auto w-full"
                style={page.width && page.height ? { aspectRatio: `${page.width} / ${page.height}` } : undefined}
              />
            </div>
          ))}
        </div>
      </div>

      <Sheet open={grid} onOpenChange={setGrid}>
        <SheetContent title="Pages" description={`${pages.length} pages. Tap one to go there.`}>
          <ul className="grid grid-cols-3 gap-3 px-4 pb-4 sm:grid-cols-4">
            {pages.map((page, index) => (
              <li key={page.src}>
                <button
                  type="button"
                  onClick={() => {
                    setGrid(false);
                    // After the sheet closes, so the page can scroll.
                    setTimeout(() => goTo(index + 1), 50);
                  }}
                  className={cn("flex w-full flex-col items-center gap-1 rounded-md p-1 text-xs font-semibold hover:bg-muted", current === index + 1 && "ring-2 ring-primary")}
                  aria-label={`Page ${index + 1}`}
                >
                  <span className="paper block w-full overflow-hidden rounded bg-white" style={page.width && page.height ? { aspectRatio: `${page.width} / ${page.height}` } : undefined}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={page.src} alt="" loading="lazy" className="block h-full w-full object-contain" />
                  </span>
                  {index + 1}
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}
