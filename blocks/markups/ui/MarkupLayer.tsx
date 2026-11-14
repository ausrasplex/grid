"use client";

// Markups over a plan sheet: the drawing itself, the tools in the bar
// under the plan, and the cards for picking, measuring and setting the
// scale. Lives inside the Plans viewer through the plan overlay.
//
// Tools: pick one and draw with one finger (two fingers still move and
// zoom). Tap a markup with no tool picked to select it. Markups save as
// soon as they're drawn; Undo takes the last thing back.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Circle, Cloud, DraftingCompass, Highlighter, MoveUpRight, Pencil, Ruler, Slash, Square, SquareDashed, Trash2, Type, Undo2, X } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  FormActions,
  PlanLayer,
  PlanToolButton,
  Segmented,
  Sheet,
  SheetContent,
  Switch,
  api,
  cn,
  newId,
  usePlanOverlay,
  usePlanPointer,
  type PlanPointer,
} from "@grid/ui";
import {
  INKS,
  INK_NAMES,
  KIND_NAMES,
  arrowHead,
  box,
  centreOf,
  cloudPath,
  distance,
  formatLength,
  measureLabel,
  metresPerUnitFromPoints,
  midpointAlong,
  paperSize,
  parseLength,
  pickMarkup,
  polygonArea,
  polylineLength,
  polylinePath,
  scaleFor,
  showsOn,
  simplify,
  textBox,
  formatArea,
  type Ink,
  type MarkupKind,
  type Point,
} from "../geometry";

export interface MarkupJson {
  id: string;
  versionId: string;
  kind: MarkupKind;
  points: Point[];
  color: string;
  size: number;
  text: string | null;
  visibility: "JUST_ME" | "COMPANY" | "SHARED";
  by: string;
  createdAt: string;
  updatedAt: string;
  canChange: boolean;
  mine: boolean;
}

export interface ScaleJson {
  versionId: string;
  metresPerUnit: number;
  method: "RATIO" | "POINTS";
  ratio: number | null;
  knownMetres: number | null;
  setBy: string;
  setAt: string;
}

type ToolId = "pen" | "highlight" | "text" | "arrow" | "line" | "rect" | "ellipse" | "cloud" | "length" | "area" | "scale";

const TOOLS: { id: Exclude<ToolId, "scale">; kind: MarkupKind; label: string; icon: ReactNode; order: number }[] = [
  { id: "pen", kind: "PEN", label: "Pen", icon: <Pencil />, order: 10 },
  { id: "highlight", kind: "HIGHLIGHT", label: "Highlight", icon: <Highlighter />, order: 11 },
  { id: "text", kind: "TEXT", label: "Text", icon: <Type />, order: 12 },
  { id: "arrow", kind: "ARROW", label: "Arrow", icon: <MoveUpRight />, order: 13 },
  { id: "line", kind: "LINE", label: "Line", icon: <Slash />, order: 14 },
  { id: "rect", kind: "RECT", label: "Box", icon: <Square />, order: 15 },
  { id: "ellipse", kind: "ELLIPSE", label: "Circle", icon: <Circle />, order: 16 },
  { id: "cloud", kind: "CLOUD", label: "Cloud", icon: <Cloud />, order: 17 },
  { id: "length", kind: "LENGTH", label: "Length", icon: <Ruler />, order: 30 },
  { id: "area", kind: "AREA", label: "Area", icon: <SquareDashed />, order: 31 },
];
const FREEHAND: ToolId[] = ["pen", "highlight"];
const DRAG_SHAPES: ToolId[] = ["arrow", "line", "rect", "ellipse", "cloud"];
const TAP_POINTS: ToolId[] = ["length", "area", "scale"];

/** Line width (or text height) on screen, in pixels, for Small / Medium / Large. */
const SIZES: Record<"line" | "highlight" | "text" | "measure", [number, number, number]> = {
  line: [2, 4, 8],
  highlight: [12, 22, 36],
  text: [12, 18, 28],
  measure: [2, 3, 5],
};
const sizeGroup = (kind: MarkupKind) => (kind === "HIGHLIGHT" ? "highlight" : kind === "TEXT" ? "text" : kind === "LENGTH" || kind === "AREA" ? "measure" : "line");

type UndoStep = { type: "add"; id: string } | { type: "delete"; markup: MarkupJson } | { type: "update"; id: string; before: Partial<MarkupJson> };

const ink = (color: string) => INKS[color as Ink] ?? INKS.red;
const day = (date: string) => new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function MarkupLayer({ sheetId, initial, canAdd, solo }: { sheetId: string; initial: { markups: MarkupJson[]; scales: ScaleJson[] }; canAdd: boolean; solo: boolean }) {
  const overlay = usePlanOverlay();
  const { view, version, versions, isCurrent, hidden, setTool } = overlay;
  const tool = overlay.tool?.startsWith("markups.") ? (overlay.tool.slice(8) as ToolId) : null;

  const [markups, setMarkups] = useState(initial.markups);
  const [scales, setScales] = useState(initial.scales);
  const [inkName, setInkName] = useState<Ink>("red");
  const [sizeStep, setSizeStep] = useState<0 | 1 | 2>(1);
  const [draft, setDraft] = useState<{ tool: ToolId; points: Point[] } | null>(null);
  // The stroke being drawn also lives in a ref, so fast drags never lose
  // points between renders; the state is only for drawing it.
  const stroke = useRef<{ tool: ToolId; points: Point[] } | null>(null);
  const setStroke = useCallback((next: { tool: ToolId; points: Point[] } | null) => {
    stroke.current = next;
    setDraft(next);
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    { type: "text"; point: Point; markup?: MarkupJson } | { type: "scale"; points?: [Point, Point]; then?: ToolId } | { type: "ink" } | null
  >(null);

  const canDraw = canAdd && isCurrent;
  const visible = useMemo(() => showsOn(markups, version.id, versions), [markups, version.id, versions]);
  const scale = useMemo(() => scaleFor(version.id, versions, scales), [version.id, versions, scales]);
  const metresPerUnit = scale?.metresPerUnit ?? null;
  const selected = visible.find((markup) => markup.id === selectedId) ?? null;

  // Errors fade after a few seconds.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  // Changing tool (or putting it down) drops a half-drawn markup.
  useEffect(() => {
    if (stroke.current && stroke.current.tool !== tool) setStroke(null);
    if (tool) setSelectedId(null);
  }, [tool, setStroke]);

  const pickTool = (next: ToolId | null) => {
    if (next && (next === "length" || next === "area") && !scale) {
      setDialog({ type: "scale", then: next });
      return;
    }
    setTool(next && next !== tool ? `markups.${next}` : null);
  };

  const failed = (error: unknown) => setError(error instanceof Error ? error.message : String(error));

  // -----------------------------------------------------------------
  // Saving
  // -----------------------------------------------------------------

  const save = useCallback(
    async (kind: MarkupKind, points: Point[], options: { text?: string; sizePx?: number } = {}) => {
      const id = newId();
      const size = (options.sizePx ?? SIZES[sizeGroup(kind)][sizeStep]) / view.scale;
      const markup: MarkupJson = {
        id,
        versionId: version.id,
        kind,
        points,
        color: inkName,
        size,
        text: options.text ?? null,
        visibility: "COMPANY",
        by: "You",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        canChange: true,
        mine: true,
      };
      setMarkups((current) => [...current, markup]);
      setUndo((current) => [...current, { type: "add", id }]);
      try {
        const saved = await api<MarkupJson>("/markups", {
          body: { id, sheetId, versionId: version.id, kind, points, color: inkName, size, text: options.text ?? null },
        });
        setMarkups((current) => current.map((entry) => (entry.id === id ? saved : entry)));
      } catch (error) {
        setMarkups((current) => current.filter((entry) => entry.id !== id));
        setUndo((current) => current.filter((step) => !(step.type === "add" && step.id === id)));
        failed(error);
      }
    },
    [inkName, sizeStep, view.scale, version.id, sheetId],
  );

  const update = async (markup: MarkupJson, changes: Partial<Pick<MarkupJson, "color" | "text" | "visibility" | "points" | "size">>, record = true) => {
    const before = Object.fromEntries(Object.keys(changes).map((key) => [key, markup[key as keyof MarkupJson]])) as Partial<MarkupJson>;
    setMarkups((current) => current.map((entry) => (entry.id === markup.id ? { ...entry, ...changes } : entry)));
    try {
      const saved = await api<MarkupJson>(`/markups/${markup.id}`, { method: "PATCH", body: changes });
      setMarkups((current) => current.map((entry) => (entry.id === markup.id ? saved : entry)));
      if (record) setUndo((current) => [...current, { type: "update", id: markup.id, before }]);
    } catch (error) {
      setMarkups((current) => current.map((entry) => (entry.id === markup.id ? { ...entry, ...before } : entry)));
      failed(error);
    }
  };

  const remove = async (markup: MarkupJson) => {
    setSelectedId(null);
    setMarkups((current) => current.filter((entry) => entry.id !== markup.id));
    try {
      await api(`/markups/${markup.id}`, { method: "DELETE" });
      setUndo((current) => [...current, { type: "delete", markup }]);
    } catch (error) {
      setMarkups((current) => [...current, markup]);
      failed(error);
    }
  };

  const undoLast = async () => {
    const step = undo[undo.length - 1];
    if (!step) return;
    setUndo((current) => current.slice(0, -1));
    try {
      if (step.type === "add") {
        setMarkups((current) => current.filter((entry) => entry.id !== step.id));
        if (selectedId === step.id) setSelectedId(null);
        await api(`/markups/${step.id}`, { method: "DELETE" });
      } else if (step.type === "delete") {
        const restored = await api<MarkupJson>(`/markups/${step.markup.id}/restore`, { body: {} });
        setMarkups((current) => [...current.filter((entry) => entry.id !== restored.id), restored]);
      } else {
        const markup = markups.find((entry) => entry.id === step.id);
        if (markup) await update(markup, step.before as Parameters<typeof update>[1], false);
      }
    } catch (error) {
      failed(error);
    }
  };

  // -----------------------------------------------------------------
  // Fingers on the sheet
  // -----------------------------------------------------------------

  // The pointer handler reads the latest state through a ref, so it isn't
  // re-subscribed on every frame of a zoom.
  const latest = useRef({ tool, otherTool: !!overlay.tool && !tool, visible, view, hidden, canDraw });
  latest.current = { tool, otherTool: !!overlay.tool && !tool, visible, view, hidden, canDraw };

  const finishPoints = useCallback(
    (current: { tool: ToolId; points: Point[] }) => {
      const minGap = 4 / latest.current.view.scale;
      const points = current.points.filter((point, index, all) => index === 0 || distance(point, all[index - 1]!) > minGap);
      if (current.tool === "length" && points.length >= 2) void save("LENGTH", points);
      else if (current.tool === "area" && points.length >= 3) void save("AREA", points);
      else return false;
      setStroke(null);
      return true;
    },
    [save, setStroke],
  );

  const onPointer = useCallback(
    (pointer: PlanPointer) => {
      const { tool, otherTool, visible, view, hidden, canDraw } = latest.current;
      const draft = stroke.current;
      const point = pointer.point;
      // Another Block's tool (a photo pin) has the taps.
      if (otherTool) return;
      if (!tool) {
        if (pointer.kind !== "click" || hidden) return;
        setSelectedId(pickMarkup(visible, point, 14 / view.scale)?.id ?? null);
        return;
      }
      if (!canDraw) return;
      if (pointer.kind === "cancel") {
        if (!TAP_POINTS.includes(tool)) setStroke(null);
        return;
      }
      if (FREEHAND.includes(tool)) {
        if (pointer.kind === "press") setStroke({ tool, points: [point] });
        else if (pointer.kind === "drag" && draft?.tool === tool) {
          const last = draft.points[draft.points.length - 1]!;
          if (distance(last, point) * view.scale > 1.5) setStroke({ tool, points: [...draft.points, point] });
        } else if (pointer.kind === "release" && draft?.tool === tool) {
          setStroke(null);
          const points = simplify(draft.points, 0.6 / view.scale);
          if (points.length >= 2 && polylineLength(points) * view.scale > 3) void save(tool === "pen" ? "PEN" : "HIGHLIGHT", points);
        }
        return;
      }
      if (DRAG_SHAPES.includes(tool)) {
        if (pointer.kind === "press") setStroke({ tool, points: [point, point] });
        else if (pointer.kind === "drag" && draft?.tool === tool) setStroke({ tool, points: [draft.points[0]!, point] });
        else if (pointer.kind === "release" && draft?.tool === tool) {
          setStroke(null);
          const [start, end] = draft.points as [Point, Point];
          if (distance(start, end) * view.scale >= 8) void save(TOOLS.find((entry) => entry.id === tool)!.kind, [start, end]);
        }
        return;
      }
      if (tool === "text") {
        if (pointer.kind === "click") setDialog({ type: "text", point });
        return;
      }
      if (TAP_POINTS.includes(tool)) {
        if (pointer.kind === "click") {
          const points = [...(draft?.tool === tool ? draft.points : []), point];
          if (tool === "scale" && points.length === 2) {
            setStroke(null);
            setTool(null);
            setDialog({ type: "scale", points: points as [Point, Point] });
          } else setStroke({ tool, points });
        } else if (pointer.kind === "double" && draft?.tool === tool && tool !== "scale") finishPoints(draft);
      }
    },
    [save, setTool, finishPoints, setStroke],
  );
  usePlanPointer(onPointer);

  // Ctrl+Z undoes; Delete removes the selected markup.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input,textarea,select,[role=dialog]")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void undoLast();
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selected?.canChange) void remove(selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // -----------------------------------------------------------------
  // Drawing
  // -----------------------------------------------------------------

  // Built once per change, not once per frame of a zoom: React skips
  // elements it has already drawn when they're the same objects.
  const drawn = useMemo(() => visible.map((markup) => <MarkupShape key={markup.id} markup={markup} />), [visible]);
  const draftShape =
    draft && draft.points.length
      ? (() => {
          const kind = draft.tool === "scale" ? "LINE" : TOOLS.find((entry) => entry.id === draft.tool)!.kind;
          const size = (draft.tool === "scale" ? 2 : SIZES[sizeGroup(kind)][sizeStep]) / view.scale;
          return <MarkupShape markup={{ id: "draft", kind, points: draft.points, color: draft.tool === "scale" ? "magenta" : inkName, size, text: null }} draft />;
        })()
      : null;

  const draftValue =
    draft?.tool === "length" ? (metresPerUnit ? formatLength(polylineLength(draft.points) * metresPerUnit) : null) : draft?.tool === "area" ? (metresPerUnit && draft.points.length > 2 ? formatArea(polygonArea(draft.points) * metresPerUnit ** 2) : null) : null;

  return (
    <>
      {!hidden && (
        <PlanLayer>
          {drawn}
          {selected && <Selection markup={selected} scale={view.scale} />}
          <Labels markups={visible} metresPerUnit={metresPerUnit} scale={view.scale} />
        </PlanLayer>
      )}
      {draftShape && <PlanLayer>{draftShape}</PlanLayer>}
      {draft && TAP_POINTS.includes(draft.tool) && (
        <PlanLayer>
          {draft.points.map((point, index) => (
            <circle key={index} cx={point[0]} cy={point[1]} r={5 / view.scale} fill="white" stroke={draft.tool === "scale" ? INKS.magenta : ink(inkName)} strokeWidth={2 / view.scale} />
          ))}
        </PlanLayer>
      )}

      {/* The card at the top: what the tool wants, and the running measurement. */}
      {tool && canDraw && (
        <div className="pointer-events-auto absolute inset-x-2 top-2 mx-auto flex max-w-md items-center gap-2 rounded-xl bg-neutral-900/95 px-3 py-2 text-sm text-white shadow-lg">
          <p className="min-w-0 flex-1">
            {tool === "scale" ? (
              <>Tap both ends of something you know the length of ({draft?.points.length ?? 0} of 2).</>
            ) : tool === "length" || tool === "area" ? (
              <>
                {draftValue ? <strong className="mr-1 text-base">{draftValue}</strong> : null}
                <span className="text-white/70">{tool === "length" ? "Tap along the run." : "Tap each corner."}</span>
                {scale?.carriedFrom && <span className="block text-xs text-amber-300">Scale from Rev {scale.carriedFrom.revision || "earlier"}: check it.</span>}
              </>
            ) : tool === "text" ? (
              "Tap where the text goes."
            ) : (
              <span className="text-white/70">Draw with one finger. Two fingers move the plan.</span>
            )}
          </p>
          {(tool === "length" || tool === "area") && (
            <>
              <button
                type="button"
                className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-30"
                disabled={!draft?.points.length}
                onClick={() => setStroke(draft && draft.points.length > 1 ? { ...draft, points: draft.points.slice(0, -1) } : null)}
                aria-label="Take back the last point"
              >
                <Undo2 className="size-5" />
              </button>
              <Button size="sm" disabled={!draft || draft.points.length < (tool === "area" ? 3 : 2)} onClick={() => draft && finishPoints(draft)}>
                <Check /> Done
              </Button>
            </>
          )}
          <button type="button" className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10" onClick={() => (setStroke(null), setTool(null))} aria-label="Put the tool down">
            <X className="size-5" />
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="pointer-events-auto absolute inset-x-2 top-16 mx-auto max-w-md rounded-xl bg-destructive px-3 py-2 text-sm text-white shadow-lg">
          {error}
        </div>
      )}

      {selected && !tool && (
        <SelectedCard
          markup={selected}
          label={measureLabel(selected, metresPerUnit)}
          fromRevision={selected.versionId !== version.id ? (versions.find((entry) => entry.id === selected.versionId)?.revision ?? "") : null}
          solo={solo}
          onClose={() => setSelectedId(null)}
          onInk={(color) => void update(selected, { color })}
          onEditText={() => setDialog({ type: "text", point: selected.points[0]!, markup: selected })}
          onVisibility={(visibility) => void update(selected, { visibility })}
          onDelete={() => void remove(selected)}
        />
      )}

      {/* The tool bar under the plan. */}
      {canDraw &&
        TOOLS.map((entry) => <PlanToolButton key={entry.id} label={entry.label} icon={entry.icon} order={entry.order} active={tool === entry.id} onClick={() => pickTool(entry.id)} />)}
      {canDraw && (
        <>
          <PlanToolButton
            label={scale ? (scale.ratio && !scale.carriedFrom ? `1:${scale.ratio}` : "Scale") : "Set scale"}
            icon={<DraftingCompass />}
            order={32}
            active={tool === "scale" || dialog?.type === "scale"}
            className={scale?.carriedFrom ? "text-amber-300" : undefined}
            onClick={() => (setTool(null), setDialog({ type: "scale" }))}
          />
          <PlanToolButton
            label="Colour"
            icon={<span className="block size-5 rounded-full border-2 border-white/80" style={{ background: INKS[inkName] }} />}
            order={50}
            onClick={() => setDialog({ type: "ink" })}
          />
          <PlanToolButton label="Undo" icon={<Undo2 />} order={60} disabled={!undo.length} onClick={() => void undoLast()} />
        </>
      )}

      <Sheet open={dialog?.type === "text"} onOpenChange={(open) => !open && setDialog(null)}>
        <SheetContent title={dialog?.type === "text" && dialog.markup ? "Change text" : "Add text"}>
          {dialog?.type === "text" && (
            <TextForm
              initial={dialog.markup?.text ?? ""}
              onSave={async (text) => {
                if (dialog.markup) await update(dialog.markup, { text });
                else await save("TEXT", [dialog.point], { text });
                setDialog(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={dialog?.type === "ink"} onOpenChange={(open) => !open && setDialog(null)}>
        <SheetContent title="Colour and size">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              {(Object.keys(INKS) as Ink[]).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setInkName(name)}
                  aria-pressed={inkName === name}
                  className={cn("flex min-h-touch flex-col items-center gap-1 rounded-lg px-2 py-1 text-xs", inkName === name && "bg-muted")}
                >
                  <span className={cn("block size-9 rounded-full ring-2 ring-offset-2 ring-offset-background", inkName === name ? "ring-primary" : "ring-transparent")} style={{ background: INKS[name] }} />
                  {INK_NAMES[name]}
                </button>
              ))}
            </div>
            <Segmented
              label="Size"
              value={String(sizeStep) as "0" | "1" | "2"}
              onChange={(value) => setSizeStep(Number(value) as 0 | 1 | 2)}
              items={[
                { value: "0", label: "Thin" },
                { value: "1", label: "Medium" },
                { value: "2", label: "Thick" },
              ]}
            />
            <p className="text-sm text-muted-foreground">Lines and text keep the size they had on screen when you drew them.</p>
            <FormActions>
              <Button onClick={() => setDialog(null)}>Done</Button>
            </FormActions>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={dialog?.type === "scale"} onOpenChange={(open) => !open && setDialog(null)}>
        <SheetContent title={`Scale for ${version.revision ? `Rev ${version.revision}` : "this sheet"}`} description="Set it once and every length and area on this revision is measured with it.">
          {dialog?.type === "scale" && (
            <ScaleForm
              sheetId={sheetId}
              version={version}
              scale={scale}
              points={dialog.points ?? null}
              onPickPoints={() => {
                setDialog(null);
                setStroke(null);
                setTool("markups.scale");
              }}
              onSaved={async (then) => {
                const fresh = await api<{ scales: ScaleJson[] }>(`/markups/sheet/${sheetId}`);
                setScales(fresh.scales);
                setDialog(null);
                if (then) setTool(`markups.${then}`);
              }}
              then={dialog.then}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------
// One markup, in sheet units
// ---------------------------------------------------------------------

type Drawable = Pick<MarkupJson, "id" | "kind" | "points" | "color" | "size" | "text">;

function MarkupShape({ markup, draft }: { markup: Drawable; draft?: boolean }) {
  const colour = ink(markup.color);
  const width = markup.size;
  const line = { fill: "none", stroke: colour, strokeWidth: width, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const [first, second] = markup.points as [Point, Point];
  switch (markup.kind) {
    case "PEN":
      return <path d={polylinePath(markup.points)} {...line} />;
    case "HIGHLIGHT":
      // Plain see-through ink. No "multiply" blend: blending SVG over the plan's
      // WebGL canvas makes tablets re-blend every frame, and it flickers.
      return <path d={polylinePath(markup.points)} {...line} strokeOpacity={0.4} />;
    case "LINE":
      return <path d={polylinePath([first, second ?? first])} {...line} />;
    case "ARROW": {
      const end = second ?? first;
      const [left, right] = arrowHead(first, end, Math.max(width * 5, distance(first, end) * 0.06));
      return <path d={`${polylinePath([first, end])}${polylinePath([left, end, right])}`} {...line} />;
    }
    case "RECT": {
      const [left, top, right, bottom] = box(first, second ?? first);
      return <rect x={left} y={top} width={right - left} height={bottom - top} {...line} />;
    }
    case "ELLIPSE": {
      const [left, top, right, bottom] = box(first, second ?? first);
      return <ellipse cx={(left + right) / 2} cy={(top + bottom) / 2} rx={(right - left) / 2} ry={(bottom - top) / 2} {...line} />;
    }
    case "CLOUD":
      return <path d={cloudPath(first, second ?? first, Math.max(width * 8, 1e-6))} {...line} />;
    case "TEXT": {
      const [x, y] = first;
      return (
        <text x={x} y={y} fontSize={markup.size} fill={colour} stroke="white" strokeWidth={markup.size * 0.18} paintOrder="stroke" fontWeight={600} fontFamily="system-ui, sans-serif" dominantBaseline="hanging">
          {(markup.text ?? "").split("\n").map((row, index) => (
            <tspan key={index} x={x} dy={index ? markup.size * 1.25 : 0}>
              {row || " "}
            </tspan>
          ))}
        </text>
      );
    }
    case "LENGTH":
      return (
        <g>
          <path d={polylinePath(markup.points)} {...line} strokeDasharray={draft ? undefined : `${width * 4} ${width * 2}`} />
          {markup.points.map((point, index) => (
            <circle key={index} cx={point[0]} cy={point[1]} r={width * 1.6} fill={colour} />
          ))}
        </g>
      );
    case "AREA":
      return <path d={polylinePath(markup.points, markup.points.length > 2)} {...line} fill={colour} fillOpacity={0.15} />;
  }
}

/** A dashed outline round the selected markup, the same width at any zoom. */
function Selection({ markup, scale }: { markup: MarkupJson; scale: number }) {
  const [left, top, right, bottom] =
    markup.kind === "TEXT"
      ? textBox(markup)
      : markup.points.reduce<[number, number, number, number]>(
          (bounds, point) => [Math.min(bounds[0], point[0]), Math.min(bounds[1], point[1]), Math.max(bounds[2], point[0]), Math.max(bounds[3], point[1])],
          [Infinity, Infinity, -Infinity, -Infinity],
        );
  const pad = 8 / scale + markup.size / 2;
  return (
    <rect
      x={left - pad}
      y={top - pad}
      width={right - left + pad * 2}
      height={bottom - top + pad * 2}
      fill="none"
      stroke="#0ea5e9"
      strokeWidth={2}
      strokeDasharray="6 4"
      vectorEffect="non-scaling-stroke"
      rx={4 / scale}
    />
  );
}

/** Measurement labels, the same size on screen at any zoom. */
function Labels({ markups, metresPerUnit, scale }: { markups: MarkupJson[]; metresPerUnit: number | null; scale: number }) {
  const fontSize = 13 / scale;
  return (
    <>
      {markups
        .filter((markup) => markup.kind === "LENGTH" || markup.kind === "AREA")
        .map((markup) => {
          const [x, y] = markup.kind === "LENGTH" ? midpointAlong(markup.points) : centreOf(markup.points);
          const label = measureLabel(markup, metresPerUnit) ?? "Set the scale";
          return (
            <text
              key={markup.id}
              x={x}
              y={y - (markup.kind === "LENGTH" ? 6 / scale : 0)}
              fontSize={fontSize}
              fontWeight={700}
              fontFamily="system-ui, sans-serif"
              textAnchor="middle"
              dominantBaseline={markup.kind === "LENGTH" ? "auto" : "middle"}
              fill={ink(markup.color)}
              stroke="white"
              strokeWidth={3.5 / scale}
              paintOrder="stroke"
            >
              {label}
            </text>
          );
        })}
    </>
  );
}

// ---------------------------------------------------------------------
// Cards and forms
// ---------------------------------------------------------------------

function SelectedCard({
  markup,
  label,
  fromRevision,
  solo,
  onClose,
  onInk,
  onEditText,
  onVisibility,
  onDelete,
}: {
  markup: MarkupJson;
  label: string | null;
  fromRevision: string | null;
  solo: boolean;
  onClose: () => void;
  onInk: (color: Ink) => void;
  onEditText: () => void;
  onVisibility: (visibility: "JUST_ME" | "COMPANY") => void;
  onDelete: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute right-[4.5rem] bottom-2 left-2 mx-auto flex max-w-md flex-col gap-2 rounded-xl bg-card p-3 text-card-foreground shadow-lg sm:bottom-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {KIND_NAMES[markup.kind]}
            {label && <span className="ml-2 text-primary">{label}</span>}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {markup.by} · {day(markup.createdAt)}
            {fromRevision !== null && ` · from ${fromRevision ? `Rev ${fromRevision}` : "an earlier revision"}`}
          </p>
        </div>
        <button type="button" onClick={onClose} className="-m-1 flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      {markup.canChange && (
        <>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(INKS) as Ink[]).map((name) => (
              <button key={name} type="button" onClick={() => onInk(name)} aria-label={INK_NAMES[name]} aria-pressed={markup.color === name} className="flex size-11 items-center justify-center rounded-md hover:bg-muted">
                <span className={cn("block size-7 rounded-full ring-2 ring-offset-2 ring-offset-card", markup.color === name ? "ring-primary" : "ring-transparent")} style={{ background: INKS[name] }} />
              </button>
            ))}
          </div>
          {!solo && markup.mine && (
            <label className="flex min-h-touch items-center justify-between gap-3 text-sm">
              <span>
                Just me
                <span className="block text-xs text-muted-foreground">Hide it from the rest of the business.</span>
              </span>
              <Switch checked={markup.visibility === "JUST_ME"} onCheckedChange={(checked: boolean) => onVisibility(checked ? "JUST_ME" : "COMPANY")} />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {markup.kind === "TEXT" && (
              <Button size="sm" variant="outline" onClick={onEditText}>
                <Type /> Change text
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
              <Trash2 /> Delete
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function TextForm({ initial, onSave }: { initial: string; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        await onSave(text.trim());
        setBusy(false);
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Text
        <textarea
          autoFocus
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-base font-normal"
          placeholder="e.g. Move GPO 300 mm left"
        />
      </label>
      <FormActions>
        <Button type="submit" size="lg" disabled={busy || !text.trim()}>
          Save
        </Button>
      </FormActions>
    </form>
  );
}

const COMMON_RATIOS = [20, 50, 100, 200, 500];

function ScaleForm({
  sheetId,
  version,
  scale,
  points,
  then,
  onPickPoints,
  onSaved,
}: {
  sheetId: string;
  version: { id: string; revision: string; pageWidthPt: number | null; pageHeightPt: number | null };
  scale: ReturnType<typeof scaleFor>;
  points: [Point, Point] | null;
  then?: ToolId;
  onPickPoints: () => void;
  onSaved: (then?: ToolId) => Promise<void>;
}) {
  const paper = paperSize(version.pageWidthPt, version.pageHeightPt);
  const [ratio, setRatio] = useState(scale?.method === "RATIO" && scale.ratio ? String(scale.ratio) : "100");
  const [known, setKnown] = useState("");
  const [unit, setUnit] = useState<"m" | "mm">("m");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/markups/sheet/${sheetId}/scale/${version.id}`, { method: "PUT", body });
      await onSaved(then);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  // Step two of "measure something you know": how long is it?
  if (points) {
    const metres = parseLength(known, unit);
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (metres) void send({ method: "POINTS", points, knownMetres: metres });
        }}
      >
        <Field
          label="How long is it really?"
          hint="A door (820 mm), a grid line spacing, a dimension written on the plan. The longer it is, the closer your measurements."
          inputMode="decimal"
          autoFocus
          value={known}
          onChange={(event) => setKnown(event.target.value)}
          placeholder={unit === "m" ? "e.g. 6.0" : "e.g. 6000"}
        />
        <Segmented
          label="Units"
          value={unit}
          onChange={setUnit}
          items={[
            { value: "m", label: "Metres" },
            { value: "mm", label: "Millimetres" },
          ]}
        />
        {metres && <p className="text-sm text-muted-foreground">That makes the whole sheet {formatLength(metresPerUnitFromPoints(points[0], points[1], metres))} wide.</p>}
        <Alert variant="error">{error}</Alert>
        <FormActions>
          <Button type="button" variant="ghost" onClick={onPickPoints}>
            Pick again
          </Button>
          <Button type="submit" size="lg" disabled={busy || !metres}>
            Set scale
          </Button>
        </FormActions>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {scale && (
        <p className={cn("rounded-lg px-3 py-2 text-sm", scale.carriedFrom ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted")}>
          {scale.carriedFrom ? `Using the scale from Rev ${scale.carriedFrom.revision || "an earlier revision"}. Check a known length, or set it again for this one.` : scale.method === "RATIO" ? `Set to 1:${scale.ratio}.` : "Set from a length you know."}
        </p>
      )}

      {version.pageWidthPt ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number(ratio);
            if (value >= 1) void send({ method: "RATIO", ratio: Math.round(value) });
          }}
        >
          <h3 className="font-semibold">Drawing scale</h3>
          <div className="flex flex-wrap gap-2">
            {COMMON_RATIOS.map((value) => (
              <Button key={value} type="button" size="sm" variant={ratio === String(value) ? "default" : "outline"} onClick={() => setRatio(String(value))}>
                1:{value}
              </Button>
            ))}
          </div>
          <Field label="Or type it: 1 to …" inputMode="numeric" value={ratio} onChange={(event) => setRatio(event.target.value.replace(/[^0-9]/g, ""))} />
          <p className="text-sm text-muted-foreground">
            {paper ? `This PDF is ${paper}. ` : ""}Use the scale for this paper size: a plan marked &quot;1:100 at A1&quot; that was printed to A3 is 1:200.
          </p>
          <FormActions>
            <Button type="submit" size="lg" disabled={busy || !(Number(ratio) >= 1)}>
              Use 1:{ratio || "…"}
            </Button>
          </FormActions>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">This sheet is a picture, not a PDF, so measure something you know to set its scale.</p>
      )}

      <div className="flex flex-col gap-2 border-t pt-4">
        <h3 className="font-semibold">Measure something you know</h3>
        <p className="text-sm text-muted-foreground">Tap both ends of a length you know, then type how long it is. Best when the drawing&apos;s scale is unknown or it was printed to fit.</p>
        <Button variant="outline" onClick={onPickPoints}>
          <Ruler /> Pick two points
        </Button>
      </div>
      <Alert variant="error">{error}</Alert>
    </div>
  );
}
