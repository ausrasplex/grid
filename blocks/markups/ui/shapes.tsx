// Drawing markups and placed icons in sheet units, with no state: used by
// the live layers over the plan viewer, and on the server for a shared
// plan link and plan PDFs (../drawing.tsx). No hooks, no "use client".

import { INKS, arrowHead, box, centreOf, cloudPath, distance, measureLabel, midpointAlong, polylinePath, type Ink, type MarkupKind, type Point } from "../geometry";
import type { Trade, TradeIcon } from "../icons";
import { IconShape } from "./IconGlyph";

export const ink = (color: string) => INKS[color as Ink] ?? INKS.red;

export interface Drawable {
  id: string;
  kind: MarkupKind;
  points: Point[];
  color: string;
  size: number;
  text: string | null;
}

export function MarkupShape({ markup, draft }: { markup: Drawable; draft?: boolean }) {
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

/**
 * A length's or area's reading at a fixed size on the sheet (for a shared
 * plan or a PDF; the live viewer keeps its labels the same size on screen).
 * `fontSize` is in sheet units.
 */
export function MeasureLabel({ markup, metresPerUnit, fontSize }: { markup: Drawable; metresPerUnit: number | null; fontSize: number }) {
  if (markup.kind !== "LENGTH" && markup.kind !== "AREA") return null;
  const label = measureLabel(markup, metresPerUnit);
  if (!label) return null;
  const [x, y] = markup.kind === "LENGTH" ? midpointAlong(markup.points) : centreOf(markup.points);
  return (
    <text
      x={x}
      y={y - (markup.kind === "LENGTH" ? fontSize * 0.45 : 0)}
      fontSize={fontSize}
      fontWeight={700}
      fontFamily="system-ui, sans-serif"
      textAnchor="middle"
      dominantBaseline={markup.kind === "LENGTH" ? "auto" : "middle"}
      fill={ink(markup.color)}
      stroke="white"
      strokeWidth={fontSize * 0.27}
      paintOrder="stroke"
    >
      {label}
    </text>
  );
}

/** A placed trade icon, centred on its point, with its number when the job has more than one. */
export function PlacedIcon({ point, size, icon, trade, number }: { point: Point; size: number; icon: TradeIcon; trade: Trade; number: number | null }) {
  const [x, y] = point;
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})`}>
      <IconShape icon={icon} colour={trade.colour} />
      {number !== null && (
        <text x={23} y={2} fontSize={9} fontWeight={800} fontFamily="system-ui, sans-serif" fill={trade.colour} stroke="white" strokeWidth={2.5} paintOrder="stroke">
          {number}
        </text>
      )}
    </g>
  );
}
