import { test } from "node:test";
import assert from "node:assert/strict";
import { customLayout, isCompact, layoutById, layoutProblem, perPage, placeStickers, qrSide, STICKER_LAYOUTS } from "../sticker-layouts.ts";
import { fieldKey, presetCategories } from "../presets.ts";

test("every built-in layout fits on its page", () => {
  for (const layout of STICKER_LAYOUTS) assert.equal(layoutProblem(layout), null, layout.id);
  assert.deepEqual(
    STICKER_LAYOUTS.map((layout) => perPage(layout)),
    [8, 10, 14, 16, 21, 24, 40, 65, 1],
  );
});

test("stickers go across then down, and onto the next page", () => {
  const layout = layoutById("a4-21");
  const placed = placeStickers(layout, Array.from({ length: 23 }, (_, index) => index));
  assert.deepEqual([placed[0]!.x, placed[0]!.y], [7.2, 15.15]);
  assert.deepEqual([placed[1]!.x, placed[1]!.y], [73.24, 15.15]);
  assert.deepEqual([placed[3]!.x, placed[3]!.y], [7.2, 53.25]);
  assert.deepEqual([placed[21]!.page, placed[21]!.x, placed[21]!.y], [1, 7.2, 15.15]);
});

test("a part-used sheet starts further along, and Move everything nudges", () => {
  const layout = layoutById("a4-21");
  const placed = placeStickers(layout, ["a", "b"], 20, { x: 1, y: -0.5 });
  assert.deepEqual(placed.map((entry) => [entry.page, entry.x, entry.y]), [
    [0, 74.24, 243.25],
    [0, 140.28, 243.25],
  ]);
});

test("a Custom layout is typed off the packet", () => {
  const layout = customLayout({ paper: "a4", columns: 4, rows: 12, width: 48.5, height: 22, top: 14, left: 6.5, gapX: 0, gapY: 0.5 });
  assert.equal(perPage(layout), 48);
  assert.equal(layout.pitchY, 22.5);
  assert.equal(layoutProblem(layout), null);
  assert.match(layoutProblem(customLayout({ paper: "a4", columns: 5, rows: 12, width: 48.5, height: 22, top: 14, left: 6.5, gapX: 0, gapY: 0 }))!, /right edge/);
  const roll = customLayout({ paper: "roll", columns: 3, rows: 3, width: 50, height: 25, top: 9, left: 9, gapX: 2, gapY: 2 });
  assert.deepEqual([roll.page.width, roll.page.height, perPage(roll), roll.top], [50, 25, 1, 0]);
});

test("small stickers drop the logo and name, and the QR code fits", () => {
  assert.equal(isCompact(layoutById("a4-65")), true);
  assert.equal(isCompact(layoutById("a4-21")), false);
  assert.equal(qrSide(layoutById("a4-21")), 31.75);
  assert.equal(qrSide(layoutById("a4-8")), 40);
  assert.equal(qrSide(layoutById("a4-65")), 18.2);
});

test("trade starting categories, and field keys", () => {
  assert.equal(presetCategories("ELECTRICAL")[0]!.name, "Power tools");
  assert.ok(presetCategories("NOPE").length > 0);
  assert.equal(fieldKey("Rated load (kg)"), "rated-load-kg");
});

test("presets bring a picture and their routines", async () => {
  const { guessIcon } = await import("../category-icons.ts");
  const power = presetCategories("ELECTRICAL").find((entry) => entry.name === "Power tools")!;
  assert.equal(power.icon, "drill");
  assert.deepEqual(power.routines, [{ name: "Test & tag", everyMonths: 3, mustPass: true }]);
  assert.equal(presetCategories("BUILDER").find((entry) => entry.name === "Harnesses & height safety")!.routines[0]!.everyMonths, 6);
  assert.equal(guessIcon("Ladders"), "construction");
  assert.equal(guessIcon("Leads & RCDs"), "plug");
  assert.equal(guessIcon("Something new"), "package");
});
