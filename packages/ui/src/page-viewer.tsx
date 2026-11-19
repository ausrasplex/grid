"use client";

// A PDF viewer (Documents, quote PDFs): pages one under another, on paper. Zoom with the
// buttons, Ctrl + scroll wheel or two fingers; jump to a page; see every
// page small and tap one to go there. Pages load as they come into view.
// With `find` (Documents), Find on page highlights the words over the
// pictures, with next and previous; `start` opens at a page and/or with a
// search already made (from a search result).

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, LayoutGrid, Minus, Plus, Search, X } from "lucide-react";
import { Button } from "./components/button";
import { SearchInput } from "./controls";
import { Sheet, SheetContent } from "./components/sheet";
import { cn } from "./lib/utils";

export interface ViewerPage {
  src: string;
  width: number;
  height: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clamp = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));

/** One place words were found: the page (1-based) and each word's box as fractions of the page [left, top, right, bottom]. */
export interface FindMatch {
  page: number;
  boxes: [number, number, number, number][];
}

export function PageViewer({
  pages,
  title,
  find,
  start,
}: {
  pages: ViewerPage[];
  title: string;
  /** Find on page: where the words are. `ready: false` while the server is still reading the document. */
  find?: (query: string) => Promise<{ matches: FindMatch[]; ready: boolean }>;
  /** Open at this page, and/or with this search made. */
  start?: { page?: number; query?: string } | null;
}) {
  const [zoom, setZoom] = useState(1);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; matches: FindMatch[]; ready: boolean } | null>(null);
  const [matchIndex, setMatchIndex] = useState(0);
  const currentMark = useRef<HTMLSpanElement | null>(null);
  const jumpToFirst = useRef<number | null>(null);
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

  // Opened from a search result: go to the page, and search for the words.
  useEffect(() => {
    if (!start) return;
    if (start.page) {
      jumpToFirst.current = start.page;
      setTimeout(() => goTo(start.page!), 50);
    }
    if (start.query && find) {
      setFinding(true);
      setQuery(start.query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.page, start?.query]);

  // Find on page, a moment after typing stops.
  useEffect(() => {
    if (!find) return;
    const typed = query.trim();
    if (typed.length < 2) {
      setFound(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void find(typed)
        .then((result) => {
          if (!alive) return;
          setFound({ query: typed, ...result });
          // The first match on (or after) the page we opened at, else the first.
          const from = jumpToFirst.current;
          jumpToFirst.current = null;
          const first = from ? Math.max(0, result.matches.findIndex((match) => match.page >= from)) : 0;
          setMatchIndex(first);
        })
        .catch(() => alive && setFound({ query: typed, matches: [], ready: true }));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, find]);

  const matches = finding ? (found?.matches ?? []) : [];
  const currentMatch = matches[matchIndex] ?? null;
  const step = (by: number) => matches.length && setMatchIndex((index) => (((index + by) % matches.length) + matches.length) % matches.length);
  // Bring the current match into view.
  useEffect(() => {
    if (!currentMatch) return;
    const timer = setTimeout(() => {
      if (currentMark.current) currentMark.current.scrollIntoView({ block: "center", inline: "center" });
      else goTo(currentMatch.page);
    }, 30);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMatch, zoom]);

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-3">
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
        {find && (
          <Button variant={finding ? "secondary" : "ghost"} size="icon" aria-label="Find on page" aria-pressed={finding} onClick={() => setFinding((value) => !value)}>
            <Search />
          </Button>
        )}
        <Button variant="ghost" size="icon" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((value) => clamp(value / 1.25))}>
          <Minus />
        </Button>
        <button type="button" onClick={() => setZoom(1)} className="min-h-touch w-14 text-center text-sm font-semibold tabular-nums" aria-label="Fit to width">
          {Math.round(zoom * 100)}%
        </button>
        <Button variant="ghost" size="icon" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((value) => clamp(value * 1.25))}>
          <Plus />
        </Button>
        {finding && (
          <div className="flex w-full basis-full items-center gap-1 pt-1">
            <SearchInput
              label="Find on page"
              placeholder="Find in this document"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                step(event.shiftKey ? -1 : 1);
              }}
              className="min-w-0 flex-1"
            />
            <span className="min-w-20 text-center text-sm text-muted-foreground tabular-nums" aria-live="polite">
              {query.trim().length < 2 ? "" : !found || found.query !== query.trim() ? "Finding…" : !found.ready ? "Not ready yet" : matches.length ? `${matchIndex + 1} of ${matches.length}` : "Not found"}
            </span>
            <Button variant="ghost" size="icon" aria-label="Previous match" disabled={!matches.length} onClick={() => step(-1)}>
              <ChevronUp />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Next match" disabled={!matches.length} onClick={() => step(1)}>
              <ChevronDown />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Close find" onClick={() => (setFinding(false), setQuery(""))}>
              <X />
            </Button>
          </div>
        )}
      </div>

      <div ref={wrapper} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" style={{ touchAction: "pan-x pan-y" }}>
        <div className={cn("mx-auto flex flex-col gap-3", zoom === 1 && "max-w-4xl")} style={{ width: zoom === 1 ? undefined : `${zoom * 100}%` }}>
          {pages.map((page, index) => (
            <div key={page.src} ref={(element) => void (pageRefs.current[index] = element)} data-page={index + 1} className="paper relative scroll-mt-16 overflow-hidden rounded-md bg-white shadow-sm">
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
              {/* Find on page: a highlight over each word found on this page. */}
              {matches.map((match, number) =>
                match.page !== index + 1
                  ? null
                  : match.boxes.map(([left, top, right, bottom], boxIndex) => (
                      <span
                        key={`${number}-${boxIndex}`}
                        ref={number === matchIndex && boxIndex === 0 ? currentMark : undefined}
                        aria-hidden
                        className={cn("pointer-events-none absolute rounded-[2px] mix-blend-multiply", number === matchIndex ? "bg-primary ring-2 ring-primary" : "bg-primary/50")}
                        style={{ left: `${left * 100 - 0.2}%`, top: `${top * 100 - 0.15}%`, width: `${(right - left) * 100 + 0.4}%`, height: `${(bottom - top) * 100 + 0.3}%` }}
                      />
                    )),
              )}
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
