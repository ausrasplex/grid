"use client";

// The plan viewer's overlay: lets Blocks draw on top of a plan sheet
// without knowing about the viewer underneath (OpenSeadragon) or about each
// other. The Plans viewer provides it; Markups draws its layer and tools,
// Photos draws its photo pins. Each Block adds its own panel to the
// "plans.viewer" slot (props: PlanViewerPanelProps).
//
// Sheet units: x runs 0 → 1 across the sheet's width, y runs 0 → height/width
// down it. They don't change with zoom or with the revision's pixel size,
// so a markup drawn on Rev B lands in the same spot on Rev C.

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./lib/utils";

export type SheetPoint = [number, number];

/** One upload (revision) of the sheet, newest first in `versions`. */
export interface PlanVersionInfo {
  id: string;
  revision: string;
  createdAt: string;
  widthPx: number | null;
  heightPx: number | null;
  dpi: number | null;
  /** PDF page size in points (1/72 inch), when it came from a PDF. */
  pageWidthPt: number | null;
  pageHeightPt: number | null;
}

/** What the Plans viewer passes to every "plans.viewer" panel (plus ctx). */
export interface PlanViewerPanelProps {
  sheet: { id: string; projectId: string; number: string; buildingId: string | null; levelId: string | null };
  jobName: string;
}

/** Where the view is: the sheet point at the top-left corner, and screen pixels per sheet unit. */
export interface PlanView {
  x: number;
  y: number;
  scale: number;
  /** The viewer's size on screen, in pixels. */
  width: number;
  height: number;
}

/**
 * A finger, pen or mouse on the sheet. Only sent to tools while one is
 * picked (`tool` not null), except "click", which is always sent so a tap
 * can pick a markup or a pin.
 */
export interface PlanPointer {
  kind: "press" | "drag" | "release" | "click" | "double" | "cancel";
  point: SheetPoint;
  /** Screen pixels inside the viewer. */
  screen: [number, number];
}

export interface PlanOverlayValue {
  sheet: PlanViewerPanelProps["sheet"];
  /** The revision being viewed, and every revision (newest first). */
  version: PlanVersionInfo;
  versions: PlanVersionInfo[];
  /** Is it the current revision? Older ones are for looking, not drawing on. */
  isCurrent: boolean;
  /** Sheet height in sheet units (height / width). */
  aspect: number;
  view: PlanView;
  /** The tool in use, "<block>.<tool>" (e.g. "markups.pen"), or null to pan and zoom. */
  tool: string | null;
  setTool: (tool: string | null) => void;
  /** "Hide markups": every layer hides its drawing while this is on. */
  hidden: boolean;
  onPointer: (listener: (pointer: PlanPointer) => void) => () => void;
  /** Where PlanToolButton puts tool buttons (the bar under the plan). */
  toolbar: HTMLElement | null;
}

const PlanOverlayContext = createContext<PlanOverlayValue | null>(null);

export function PlanOverlayProvider({ value, children }: { value: PlanOverlayValue; children: ReactNode }) {
  return <PlanOverlayContext.Provider value={value}>{children}</PlanOverlayContext.Provider>;
}

/** The overlay of the plan viewer this component sits in. */
export function usePlanOverlay(): PlanOverlayValue {
  const value = useContext(PlanOverlayContext);
  if (!value) throw new Error("usePlanOverlay() must be used inside the plan viewer");
  return value;
}

/** Runs `listener` for every pointer on the sheet while mounted. */
export function usePlanPointer(listener: (pointer: PlanPointer) => void) {
  const { onPointer } = usePlanOverlay();
  useEffect(() => onPointer(listener), [onPointer, listener]);
}

/** A sheet point's position on screen (pixels inside the viewer). */
export function toScreen(view: PlanView, point: SheetPoint): [number, number] {
  return [(point[0] - view.x) * view.scale, (point[1] - view.y) * view.scale];
}

/**
 * An SVG layer over the plan, drawn in sheet units: it moves and zooms with
 * the sheet. Doesn't catch taps (the viewer does, and sends them on).
 */
export function PlanLayer({ children, className }: { children: ReactNode; className?: string }) {
  const { view } = usePlanOverlay();
  return (
    <svg className={cn("pointer-events-none absolute inset-0 size-full overflow-hidden", className)} aria-hidden="true">
      <g transform={`scale(${view.scale}) translate(${-view.x} ${-view.y})`}>{children}</g>
    </svg>
  );
}

/** A button in the tool bar under the plan. `order` sorts it among other Blocks' buttons. */
export function PlanToolButton({
  label,
  icon,
  active,
  order = 100,
  onClick,
  disabled,
  className,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  order?: number;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const { toolbar } = usePlanOverlay();
  if (!toolbar) return null;
  return createPortal(
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      style={{ order }}
      className={cn(
        "flex min-h-12 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md px-1.5 text-[11px] leading-none font-medium text-white/80 hover:bg-white/10 disabled:opacity-30 [&_svg]:size-5",
        active && "bg-primary text-primary-foreground hover:bg-primary",
        className,
      )}
    >
      {icon}
      <span>{label}</span>
    </button>,
    toolbar,
  );
}
