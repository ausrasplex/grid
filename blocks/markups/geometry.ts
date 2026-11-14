// Markups maths: lengths, areas, clouds, arrows, picking a markup by tap,
// and the sheet's scale. Pure (no React, no database), so it's unit-tested
// and used by both the server and the phone.
//
// Points are in sheet units: x runs 0 → 1 across the sheet's width, y runs
// 0 → height/width down it (see @grid/ui plan-overlay). A scale says how
// many real metres one sheet unit is (one whole sheet width).

export type Point = [number, number];

export const MARKUP_KINDS = ["PEN", "HIGHLIGHT", "TEXT", "LINE", "ARROW", "RECT", "ELLIPSE", "CLOUD", "LENGTH", "AREA"] as const;
export type MarkupKind = (typeof MARKUP_KINDS)[number];

/** Ink colours. Stored by name so the palette can be tuned later. */
export const INKS = {
  red: "#e5322d",
  blue: "#1f6fd1",
  green: "#1e9e4a",
  yellow: "#ffd400",
  magenta: "#c026d3",
  black: "#1a1a1a",
} as const;
export type Ink = keyof typeof INKS;
export const INK_NAMES: Record<Ink, string> = { red: "Red", blue: "Blue", green: "Green", yellow: "Yellow", magenta: "Pink", black: "Black" };

/** What each kind is called on screen. */
export const KIND_NAMES: Record<MarkupKind, string> = {
  PEN: "Pen",
  HIGHLIGHT: "Highlighter",
  TEXT: "Text",
  LINE: "Line",
  ARROW: "Arrow",
  RECT: "Box",
  ELLIPSE: "Circle",
  CLOUD: "Cloud",
  LENGTH: "Length",
  AREA: "Area",
};

export interface MarkupShape {
  kind: MarkupKind;
  points: Point[];
  /** Line width, or the text height, in sheet units. */
  size: number;
  text?: string | null;
}

// ---------------------------------------------------------------------
// Basic geometry
// ---------------------------------------------------------------------

export const distance = (first: Point, second: Point) => Math.hypot(second[0] - first[0], second[1] - first[1]);

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index++) total += distance(points[index - 1]!, points[index]!);
  return total;
}

/** Area inside a closed outline (shoelace), always positive. */
export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let twice = 0;
  for (let index = 0; index < points.length; index++) {
    const [x1, y1] = points[index]!;
    const [x2, y2] = points[(index + 1) % points.length]!;
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

/** Shortest distance from a point to the segment from `start` to `end`. */
export function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return distance(point, start);
  const along = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return distance(point, [start[0] + along * dx, start[1] + along * dy]);
}

export function distanceToPolyline(point: Point, points: Point[], closed = false): number {
  if (points.length === 1) return distance(point, points[0]!);
  let best = Infinity;
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index++) best = Math.min(best, distanceToSegment(point, points[index]!, points[(index + 1) % points.length]!));
  return best;
}

export function insidePolygon(point: Point, points: Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const [xi, yi] = points[index]!;
    const [xj, yj] = points[previous]!;
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The box two corner points make: left, top, right, bottom. */
export function box(first: Point, second: Point): [number, number, number, number] {
  return [Math.min(first[0], second[0]), Math.min(first[1], second[1]), Math.max(first[0], second[0]), Math.max(first[1], second[1])];
}

/**
 * Drops points a freehand stroke doesn't need (Ramer–Douglas–Peucker):
 * anything within `tolerance` of the line its neighbours make.
 */
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  let furthest = 0;
  let furthestIndex = 0;
  const last = points.length - 1;
  for (let index = 1; index < last; index++) {
    const gap = distanceToSegment(points[index]!, points[0]!, points[last]!);
    if (gap > furthest) {
      furthest = gap;
      furthestIndex = index;
    }
  }
  if (furthest <= tolerance) return [points[0]!, points[last]!];
  return [...simplify(points.slice(0, furthestIndex + 1), tolerance).slice(0, -1), ...simplify(points.slice(furthestIndex), tolerance)];
}

/** Halfway along a run of points (where a length label goes). */
export function midpointAlong(points: Point[]): Point {
  if (points.length === 1) return points[0]!;
  const half = polylineLength(points) / 2;
  let walked = 0;
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const step = distance(start, end);
    if (walked + step >= half && step > 0) {
      const along = (half - walked) / step;
      return [start[0] + (end[0] - start[0]) * along, start[1] + (end[1] - start[1]) * along];
    }
    walked += step;
  }
  return points[points.length - 1]!;
}

/** The middle of an outline (average of its corners; fine for room shapes). */
export function centreOf(points: Point[]): Point {
  const sum = points.reduce<Point>((total, point) => [total[0] + point[0], total[1] + point[1]], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

// ---------------------------------------------------------------------
// Drawing paths (SVG "d" strings, in sheet units)
// ---------------------------------------------------------------------

const number = (value: number) => +value.toFixed(6);

export function polylinePath(points: Point[], closed = false): string {
  if (!points.length) return "";
  const [first, ...rest] = points;
  return `M${number(first![0])} ${number(first![1])}` + rest.map((point) => `L${number(point[0])} ${number(point[1])}`).join("") + (closed ? "Z" : "");
}

/**
 * A revision cloud round the box two corners make: a row of bumps along
 * each edge, bulging outwards. `bump` is roughly each bump's width.
 */
export function cloudPath(first: Point, second: Point, bump: number): string {
  const [left, top, right, bottom] = box(first, second);
  const corners: Point[] = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
  let path = `M${number(left)} ${number(top)}`;
  for (let side = 0; side < 4; side++) {
    const start = corners[side]!;
    const end = corners[(side + 1) % 4]!;
    const length = distance(start, end);
    const count = Math.max(1, Math.round(length / Math.max(bump, 1e-9)));
    const radius = length / count / 2;
    for (let step = 1; step <= count; step++) {
      const x = start[0] + ((end[0] - start[0]) * step) / count;
      const y = start[1] + ((end[1] - start[1]) * step) / count;
      // Clockwise round the box, so sweep 1 bulges outwards.
      path += `A${number(radius)} ${number(radius)} 0 0 1 ${number(x)} ${number(y)}`;
    }
  }
  return path + "Z";
}

/** The two short strokes of an arrowhead at `tip`, pointing away from `tail`. */
export function arrowHead(tail: Point, tip: Point, length: number): [Point, Point] {
  const angle = Math.atan2(tip[1] - tail[1], tip[0] - tail[0]);
  const spread = Math.PI / 7;
  return [
    [tip[0] - length * Math.cos(angle - spread), tip[1] - length * Math.sin(angle - spread)],
    [tip[0] - length * Math.cos(angle + spread), tip[1] - length * Math.sin(angle + spread)],
  ];
}

// ---------------------------------------------------------------------
// Picking a markup with a tap
// ---------------------------------------------------------------------

/** Rough box a text markup takes up (no fonts on the server, so estimated). */
export function textBox(shape: MarkupShape): [number, number, number, number] {
  const [x, y] = shape.points[0]!;
  const lines = (shape.text ?? "").split("\n");
  const longest = Math.max(1, ...lines.map((line) => line.length));
  return [x, y, x + longest * shape.size * 0.6, y + lines.length * shape.size * 1.25];
}

/**
 * How well a tap at `point` hits a markup: 0 is right on it, bigger is
 * further; null is a miss. Lines and edges win over the inside of a shape,
 * so you can still pick something drawn inside a box.
 */
export function hitScore(shape: MarkupShape, point: Point, tolerance: number): number | null {
  const reach = tolerance + shape.size / 2;
  const points = shape.points;
  if (!points.length) return null;
  switch (shape.kind) {
    case "TEXT": {
      const [left, top, right, bottom] = textBox(shape);
      const inside = point[0] >= left - tolerance && point[0] <= right + tolerance && point[1] >= top - tolerance && point[1] <= bottom + tolerance;
      return inside ? 0 : null;
    }
    case "RECT":
    case "CLOUD": {
      if (points.length < 2) return null;
      const [left, top, right, bottom] = box(points[0]!, points[1]!);
      const outline: Point[] = [
        [left, top],
        [right, top],
        [right, bottom],
        [left, bottom],
      ];
      const edge = distanceToPolyline(point, outline, true);
      if (edge <= reach * (shape.kind === "CLOUD" ? 2 : 1)) return edge;
      return insidePolygon(point, outline) ? 1 + (right - left) * (bottom - top) : null;
    }
    case "ELLIPSE": {
      if (points.length < 2) return null;
      const [left, top, right, bottom] = box(points[0]!, points[1]!);
      const radiusX = Math.max((right - left) / 2, 1e-9);
      const radiusY = Math.max((bottom - top) / 2, 1e-9);
      const dx = (point[0] - (left + radiusX)) / radiusX;
      const dy = (point[1] - (top + radiusY)) / radiusY;
      const across = Math.hypot(dx, dy);
      const edge = Math.abs(across - 1) * Math.min(radiusX, radiusY);
      if (edge <= reach) return edge;
      return across < 1 ? 1 + Math.PI * radiusX * radiusY : null;
    }
    case "AREA": {
      const edge = distanceToPolyline(point, points, true);
      if (edge <= reach) return edge;
      return points.length > 2 && insidePolygon(point, points) ? 1 + polygonArea(points) : null;
    }
    default: {
      const gap = distanceToPolyline(point, points);
      return gap <= reach ? gap : null;
    }
  }
}

/** The markup a tap picks, or null. Ties go to the one drawn last. */
export function pickMarkup<T extends MarkupShape>(markups: T[], point: Point, tolerance: number): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const markup of markups) {
    const score = hitScore(markup, point, tolerance);
    if (score !== null && score <= bestScore) {
      best = markup;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------------
// Scale and measuring
// ---------------------------------------------------------------------

const POINTS_PER_METRE = 72 / 0.0254;

/** ISO paper sizes, short side × long side in millimetres. */
const PAPER: [string, number, number][] = [
  ["A0", 841, 1189],
  ["A1", 594, 841],
  ["A2", 420, 594],
  ["A3", 297, 420],
  ["A4", 210, 297],
  ["B1", 707, 1000],
  ["B2", 500, 707],
];

/** "A1" when the PDF page is (within a few mm) a standard paper size, else null. */
export function paperSize(pageWidthPt: number | null, pageHeightPt: number | null): string | null {
  if (!pageWidthPt || !pageHeightPt) return null;
  const toMm = (points: number) => (points / 72) * 25.4;
  const short = Math.min(toMm(pageWidthPt), toMm(pageHeightPt));
  const long = Math.max(toMm(pageWidthPt), toMm(pageHeightPt));
  return PAPER.find(([, paperShort, paperLong]) => Math.abs(short - paperShort) < 6 && Math.abs(long - paperLong) < 6)?.[0] ?? null;
}

/** From the drawing's scale (1:100 → ratio 100) and the PDF page width. */
export function metresPerUnitFromRatio(pageWidthPt: number, ratio: number): number {
  return (pageWidthPt / POINTS_PER_METRE) * ratio;
}

/** From two points on the sheet and how far apart they really are. */
export function metresPerUnitFromPoints(first: Point, second: Point, metres: number): number {
  const apart = distance(first, second);
  if (!apart) throw new Error("Pick two different points");
  return metres / apart;
}

export interface ScaleRecord {
  versionId: string;
  metresPerUnit: number;
  method: "RATIO" | "POINTS";
  ratio: number | null;
}

export interface VersionOrder {
  id: string;
  revision: string;
  createdAt: string | Date;
}

/**
 * The scale to measure with on a revision: its own, else the newest one
 * set on an earlier revision ("carried over", so check it).
 */
export function scaleFor(versionId: string, versions: VersionOrder[], scales: ScaleRecord[]): (ScaleRecord & { carriedFrom: VersionOrder | null }) | null {
  const byVersion = new Map(scales.map((scale) => [scale.versionId, scale]));
  const own = byVersion.get(versionId);
  if (own) return { ...own, carriedFrom: null };
  const viewed = versions.find((version) => version.id === versionId);
  if (!viewed) return null;
  const earlier = versions
    .filter((version) => new Date(version.createdAt).getTime() < new Date(viewed.createdAt).getTime() && byVersion.has(version.id))
    .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())[0];
  return earlier ? { ...byVersion.get(earlier.id)!, carriedFrom: earlier } : null;
}

/**
 * Markups to show on a revision: those drawn on it or on an earlier one
 * (they carry over to newer revisions, not back to older ones).
 */
export function showsOn<T extends { versionId: string }>(markups: T[], versionId: string, versions: VersionOrder[]): T[] {
  const viewed = versions.find((version) => version.id === versionId);
  if (!viewed) return [];
  const viewedAt = new Date(viewed.createdAt).getTime();
  const drawnAt = new Map(versions.map((version) => [version.id, new Date(version.createdAt).getTime()]));
  return markups.filter((markup) => (drawnAt.get(markup.versionId) ?? Infinity) <= viewedAt);
}

/** 0.82 → "820 mm", 12.4 → "12.40 m", 1520 → "1,520 m". */
export function formatLength(metres: number): string {
  if (metres < 1) return `${Math.round(metres * 1000)} mm`;
  if (metres < 1000) return `${metres.toFixed(2)} m`;
  return `${Math.round(metres).toLocaleString("en-AU")} m`;
}

export function formatArea(squareMetres: number): string {
  if (squareMetres < 10) return `${squareMetres.toFixed(2)} m²`;
  if (squareMetres < 1000) return `${squareMetres.toFixed(1)} m²`;
  return `${Math.round(squareMetres).toLocaleString("en-AU")} m²`;
}

/**
 * A length typed in: "3.6", "3.6 m", "3600mm", "360 cm", "3,600 mm".
 * Plain numbers are in `unit`. Null when it can't be read or isn't above 0.
 */
export function parseLength(text: string, unit: "m" | "mm" = "m"): number | null {
  const match = text.trim().toLowerCase().replace(/,/g, "").match(/^(\d+(?:\.\d+)?|\.\d+)\s*(mm|cm|m)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!(value > 0)) return null;
  const given = (match[2] ?? unit) as "m" | "cm" | "mm";
  return given === "mm" ? value / 1000 : given === "cm" ? value / 100 : value;
}

/** What a measuring markup reads, with the scale given; null for other kinds or no scale. */
export function measureLabel(shape: MarkupShape, metresPerUnit: number | null): string | null {
  if (!metresPerUnit) return null;
  if (shape.kind === "LENGTH") return formatLength(polylineLength(shape.points) * metresPerUnit);
  if (shape.kind === "AREA") return formatArea(polygonArea(shape.points) * metresPerUnit * metresPerUnit);
  return null;
}
