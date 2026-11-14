import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cloudPath,
  formatArea,
  formatLength,
  measureLabel,
  metresPerUnitFromPoints,
  metresPerUnitFromRatio,
  paperSize,
  parseLength,
  pickMarkup,
  polygonArea,
  polylineLength,
  scaleFor,
  showsOn,
  simplify,
  type MarkupShape,
  type Point,
} from "../geometry.ts";

const close = (actual: number, expected: number, within = 1e-6) => assert.ok(Math.abs(actual - expected) < within, `${actual} ≈ ${expected}`);

test("lengths and areas", () => {
  close(polylineLength([[0, 0], [3, 4], [3, 10]]), 11);
  close(polygonArea([[0, 0], [4, 0], [4, 3], [0, 3]]), 12);
  close(polygonArea([[0, 0], [0, 3], [4, 3], [4, 0]]), 12);
  close(polygonArea([[0, 0], [1, 1]]), 0);
});

test("paper sizes from the PDF page", () => {
  assert.equal(paperSize(2384, 1684), "A1"); // A1 landscape
  assert.equal(paperSize(1191, 842), "A3");
  assert.equal(paperSize(842, 595), "A4");
  assert.equal(paperSize(1000, 1000), null);
  assert.equal(paperSize(null, 842), null);
});

test("scale from the drawing scale", () => {
  // An A1 sheet is 841 mm wide; at 1:100 that's 84.1 m across.
  close(metresPerUnitFromRatio(2383.94, 100), 84.1, 0.01);
  // A3 at 1:200: 420 mm × 200 = 84 m.
  close(metresPerUnitFromRatio(1190.55, 200), 84, 0.01);
});

test("scale from a known length", () => {
  // Two points a tenth of the sheet apart, really 6 m apart: the sheet is 60 m wide.
  close(metresPerUnitFromPoints([0.1, 0.2], [0.2, 0.2], 6), 60);
  assert.throws(() => metresPerUnitFromPoints([0.1, 0.1], [0.1, 0.1], 6));
});

test("measure labels", () => {
  const run: MarkupShape = { kind: "LENGTH", points: [[0, 0], [0.1, 0]], size: 0.001 };
  assert.equal(measureLabel(run, 60), "6.00 m");
  assert.equal(measureLabel(run, null), null);
  const room: MarkupShape = { kind: "AREA", points: [[0, 0], [0.1, 0], [0.1, 0.05], [0, 0.05]], size: 0.001 };
  assert.equal(measureLabel(room, 60), "18.0 m²");
  assert.equal(measureLabel({ kind: "PEN", points: [[0, 0]], size: 1 }, 60), null);
});

test("formatting", () => {
  assert.equal(formatLength(0.82), "820 mm");
  assert.equal(formatLength(12.4), "12.40 m");
  assert.equal(formatLength(1520.4), "1,520 m");
  assert.equal(formatArea(4.5), "4.50 m²");
  assert.equal(formatArea(18), "18.0 m²");
  assert.equal(formatArea(2400), "2,400 m²");
});

test("typing a length", () => {
  assert.equal(parseLength("3.6"), 3.6);
  assert.equal(parseLength("3.6 m"), 3.6);
  assert.equal(parseLength("3600mm"), 3.6);
  assert.equal(parseLength("3,600 mm"), 3.6);
  assert.equal(parseLength("360 cm"), 3.6);
  assert.equal(parseLength("3600", "mm"), 3.6);
  assert.equal(parseLength("0"), null);
  assert.equal(parseLength("abc"), null);
  assert.equal(parseLength(""), null);
});

test("simplify keeps corners and drops wobble", () => {
  const points: Point[] = [[0, 0], [1, 0.001], [2, 0], [2, 1], [2.001, 2]];
  assert.deepEqual(simplify(points, 0.01), [[0, 0], [2, 0], [2.001, 2]]);
});

test("cloud path closes and has bumps on every side", () => {
  const path = cloudPath([0, 0], [4, 2], 1);
  assert.ok(path.startsWith("M0 0"));
  assert.ok(path.endsWith("Z"));
  assert.equal(path.match(/A/g)?.length, 4 + 2 + 4 + 2);
});

test("picking a markup with a tap", () => {
  const markups: (MarkupShape & { id: string })[] = [
    { id: "box", kind: "RECT", points: [[0, 0], [1, 1]], size: 0.01 },
    { id: "line", kind: "LINE", points: [[0.2, 0.5], [0.8, 0.5]], size: 0.01 },
    { id: "text", kind: "TEXT", points: [[2, 2]], size: 0.1, text: "DB-1" },
  ];
  assert.equal(pickMarkup(markups, [0.5, 0.51], 0.02)?.id, "line"); // the line inside the box wins
  assert.equal(pickMarkup(markups, [0.5, 0.2], 0.02)?.id, "box"); // inside the box
  assert.equal(pickMarkup(markups, [1.005, 0.5], 0.02)?.id, "box"); // its edge
  assert.equal(pickMarkup(markups, [2.1, 2.05], 0.02)?.id, "text");
  assert.equal(pickMarkup(markups, [5, 5], 0.02), null);
});

test("markups carry over to newer revisions, not older ones", () => {
  const versions = [
    { id: "c", revision: "C", createdAt: "2026-11-10T00:00:00Z" },
    { id: "b", revision: "B", createdAt: "2026-11-05T00:00:00Z" },
    { id: "a", revision: "A", createdAt: "2026-11-01T00:00:00Z" },
  ];
  const markups = [
    { id: "1", versionId: "a" },
    { id: "2", versionId: "b" },
    { id: "3", versionId: "c" },
  ];
  assert.deepEqual(showsOn(markups, "b", versions).map((markup) => markup.id), ["1", "2"]);
  assert.deepEqual(showsOn(markups, "c", versions).map((markup) => markup.id), ["1", "2", "3"]);
  assert.deepEqual(showsOn(markups, "a", versions).map((markup) => markup.id), ["1"]);
});

test("the scale carries over from an earlier revision", () => {
  const versions = [
    { id: "c", revision: "C", createdAt: "2026-11-10T00:00:00Z" },
    { id: "b", revision: "B", createdAt: "2026-11-05T00:00:00Z" },
    { id: "a", revision: "A", createdAt: "2026-11-01T00:00:00Z" },
  ];
  const scales = [{ versionId: "b", metresPerUnit: 84.1, method: "RATIO" as const, ratio: 100 }];
  assert.equal(scaleFor("b", versions, scales)?.carriedFrom, null);
  assert.equal(scaleFor("c", versions, scales)?.carriedFrom?.revision, "B");
  assert.equal(scaleFor("a", versions, scales), null);
});
