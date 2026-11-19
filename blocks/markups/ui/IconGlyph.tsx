// One trade icon, drawn from its description in icons.ts (24 × 24 box).
// Used on the plan (inside the overlay's SVG) and in the library.

import { useMemo } from "react";
import type { TradeIcon } from "../icons";
import { svgDataUrl, tintSvg } from "../svg";

const OUTLINES: Record<TradeIcon["outline"], string | null> = {
  circle: "M12 3a9 9 0 1 0 0.001 0z",
  square: "M3.5 3.5h17v17h-17z",
  triangle: "M12 3.5l9 16h-18z",
  diamond: "M12 2.5l9.5 9.5-9.5 9.5-9.5-9.5z",
  hexagon: "M7 3.5h10l5 8.5-5 8.5h-10l-5-8.5z",
  none: null,
};

/** The symbol in a 24 × 24 box, in `colour`, with a white backing so it reads on a busy drawing. */
export function IconShape({ icon, colour, backing = true }: { icon: TradeIcon; colour: string; backing?: boolean }) {
  if (icon.svg) return <SvgIcon svg={icon.svg} tint={!!icon.tint} colour={colour} backing={backing} />;
  const outline = OUTLINES[icon.outline];
  const label = icon.label ?? "";
  const fontSize = label.length >= 3 ? 6.5 : label.length === 2 ? 8 : 10;
  return (
    <g fill="none" stroke={colour} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {backing && <path d={outline ?? "M1 1h22v22H1z"} fill="white" fillOpacity={outline ? 0.9 : 0.75} stroke="none" />}
      {outline && <path d={outline} />}
      {icon.fill && <path d={icon.fill} fill={colour} stroke="none" />}
      {icon.path && <path d={icon.path} />}
      {label && (
        <text x={12} y={icon.outline === "triangle" ? 15.5 : 12.4} fontSize={fontSize} fontWeight={700} fontFamily="system-ui, sans-serif" textAnchor="middle" dominantBaseline="middle" fill={colour} stroke="none">
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * An uploaded SVG icon. Only ever drawn as a picture (a data: URL in
 * `<image>`), which browsers never run scripts in, on top of svg.ts making
 * it safe when it was saved.
 */
function SvgIcon({ svg, tint, colour, backing }: { svg: string; tint: boolean; colour: string; backing: boolean }) {
  const href = useMemo(() => svgDataUrl(tint ? tintSvg(svg, colour) : svg), [svg, tint, colour]);
  return (
    <g>
      {backing && <rect x={1} y={1} width={22} height={22} rx={3} fill="white" fillOpacity={0.8} />}
      <image href={href} x={1.5} y={1.5} width={21} height={21} preserveAspectRatio="xMidYMid meet" />
    </g>
  );
}

/** The symbol on its own, for lists and buttons. */
export function IconGlyph({ icon, colour, className }: { icon: TradeIcon; colour: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <IconShape icon={icon} colour={colour} backing={false} />
    </svg>
  );
}
