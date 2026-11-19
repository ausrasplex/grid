// One trade icon, drawn from its description in icons.ts (24 × 24 box).
// Used on the plan (inside the overlay's SVG) and in the library.

import type { TradeIcon } from "../icons";

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

/** The symbol on its own, for lists and buttons. */
export function IconGlyph({ icon, colour, className }: { icon: TradeIcon; colour: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <IconShape icon={icon} colour={colour} backing={false} />
    </svg>
  );
}
