import { test } from "node:test";
import assert from "node:assert/strict";
import { pageDpi, planDpi } from "../src/render-levels.ts";

// Paper sizes in points (1/72 inch).
const A1 = { widthPt: 2384, heightPt: 1684 };
const A0 = { widthPt: 3370, heightPt: 2384 };
const A3 = { widthPt: 1191, heightPt: 842 };

test("plans draw at the level's dpi when the sheet fits its size limit", () => {
  assert.equal(planDpi("LOW", A1), 200);
  // Medium is exactly today's render: 48 MP holds A1 to 248 dpi.
  assert.equal(planDpi("MEDIUM", A1), 248);
  assert.equal(planDpi("HIGH", A1), 300);
  assert.equal(planDpi("EXTREME", A3), 500);
});

test("a sheet too big for the level's size limit is drawn a bit softer", () => {
  // A1 at 500 dpi is ~194 MP: just under Extreme's 200 MP.
  assert.equal(planDpi("EXTREME", A1), 500);
  // A0 at 500 dpi would be ~388 MP; Extreme stops at 200 MP (~359 dpi).
  const dpi = planDpi("EXTREME", A0);
  assert.ok(dpi < 500 && dpi > 340, `got ${dpi}`);
  assert.ok((A0.widthPt / 72) * dpi * (A0.heightPt / 72) * dpi <= 200_000_000);
  // Medium keeps today's behaviour: A0 at ~175 dpi.
  assert.equal(planDpi("MEDIUM", A0), 175);
});

test("documents and quotes: the level's dpi, less for big pages", () => {
  const a4 = 841.89 / 72; // long side, inches
  assert.equal(pageDpi("LOW", a4), 150);
  assert.equal(pageDpi("MEDIUM", a4), 200);
  assert.equal(pageDpi("HIGH", a4), 250);
  // An A1 drawing in the library at High: held to 3300 px on the long side.
  assert.equal(pageDpi("HIGH", 2384 / 72), 99);
  assert.equal(pageDpi("MEDIUM", 0), 200);
});
