// Grid's app icon: a 3 × 3 grid of hi-vis yellow blocks on graphite, the
// last one still going in ("One Grid. Built Block by Block."). Drawn by
// next/og, so there are no image files to keep in step.
//
// Raw colours are fine here: an icon is a picture, not themed UI. They
// match concept C's --background and --primary (docs/visual-style.md).

import { ImageResponse } from "next/og";

export const GRAPHITE = "#15171b";
const YELLOW = "#f4c414";

/**
 * `maskable`: Android crops icons to a circle or squircle, so the blocks
 * shrink into the middle "safe zone" and the graphite fills the edges.
 */
export function appIcon(size: number, options: { maskable?: boolean; rounded?: boolean } = {}) {
  const art = size * (options.maskable ? 0.5 : 0.66);
  const gap = art * 0.07;
  const block = (art - gap * 2) / 3;
  const radius = block * 0.16;
  const cells = Array.from({ length: 9 }, (_, index) => index);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: GRAPHITE,
          borderRadius: options.rounded ? size * 0.22 : 0,
        }}
      >
        <div style={{ width: art, height: art, display: "flex", flexWrap: "wrap", gap }}>
          {cells.map((cell) =>
            cell === 8 ? (
              <div key={cell} style={{ width: block, height: block, borderRadius: radius, border: `${Math.max(2, block * 0.12)}px solid ${YELLOW}` }} />
            ) : (
              <div key={cell} style={{ width: block, height: block, borderRadius: radius, background: YELLOW }} />
            ),
          )}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
