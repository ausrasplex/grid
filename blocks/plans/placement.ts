// Where a plan PDF's drawing page goes over the sheet's page (sheet-pdf.ts).
// The drawing is made the way the page is SEEN (after its /Rotate), because
// that's how the zoom tiles were drawn and so where people drew. A rotated
// page's own coordinates are turned, so the drawing is turned back to fit.
// pdf-lib turns anticlockwise about (x, y); /Rotate turns clockwise.

export type PageRotation = 0 | 90 | 180 | 270;

export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const normaliseRotation = (angle: number) => ((((Math.round(angle / 90) * 90) % 360) + 360) % 360) as PageRotation;

/** The page's size as seen, and where to draw the drawing page (pdf-lib drawPage options). */
export function overlayPlacement(box: PageBox, rotation: PageRotation) {
  const sideways = rotation === 90 || rotation === 270;
  const seenWidth = sideways ? box.height : box.width;
  const seenHeight = sideways ? box.width : box.height;
  const corner = {
    0: { x: box.x, y: box.y },
    90: { x: box.x + box.width, y: box.y },
    180: { x: box.x + box.width, y: box.y + box.height },
    270: { x: box.x, y: box.y + box.height },
  }[rotation];
  return { ...corner, width: seenWidth, height: seenHeight, rotate: rotation };
}

/** Where a point of the drawing page (from its bottom left) lands on the page, for tests. */
export function landsAt(placement: ReturnType<typeof overlayPlacement>, point: [number, number]): [number, number] {
  const angle = (placement.rotate * Math.PI) / 180;
  const [a, b] = point;
  return [placement.x + a * Math.cos(angle) - b * Math.sin(angle), placement.y + a * Math.sin(angle) + b * Math.cos(angle)];
}
