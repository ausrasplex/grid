import { test } from "node:test";
import assert from "node:assert/strict";
import { landsAt, normaliseRotation, overlayPlacement, type PageRotation } from "../placement.ts";

// A portrait page, 600 × 800 points, not starting at 0.
const box = { x: 10, y: 20, width: 600, height: 800 };
const close = (actual: [number, number], expected: [number, number]) => {
  assert.ok(Math.abs(actual[0] - expected[0]) < 1e-6 && Math.abs(actual[1] - expected[1]) < 1e-6, `${actual} should be ${expected}`);
};

// Where the page's own corners are seen once /Rotate turns it clockwise.
// "seen top left" is the drawing page's top left: (0, seenHeight) from its bottom left.
const seenTopLeft: Record<PageRotation, [number, number]> = {
  0: [10, 820], // top left stays
  90: [10, 20], // turned clockwise: the bottom left comes up to the top left
  180: [610, 20], // upside down: the bottom right
  270: [610, 820], // turned anticlockwise: the top right
};

for (const rotation of [0, 90, 180, 270] as PageRotation[]) {
  test(`the drawing lines up on a page turned ${rotation}°`, () => {
    const placement = overlayPlacement(box, rotation);
    const sideways = rotation % 180 !== 0;
    assert.deepEqual([placement.width, placement.height], sideways ? [800, 600] : [600, 800]);
    close(landsAt(placement, [0, placement.height]), seenTopLeft[rotation]);
    // The opposite corner is the opposite corner of the page.
    const [x, y] = landsAt(placement, [placement.width, 0]);
    close([x, y], [10 + 610 - seenTopLeft[rotation][0], 20 + 820 - seenTopLeft[rotation][1]]);
  });
}

test("odd rotations are tidied", () => {
  assert.equal(normaliseRotation(-90), 270);
  assert.equal(normaliseRotation(450), 90);
  assert.equal(normaliseRotation(0), 0);
});
