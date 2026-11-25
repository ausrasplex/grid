import { test } from "node:test";
import assert from "node:assert/strict";
import { addUp, choiceKeys, planBringIn, type CountedRow, type ExistingLine } from "../bring-in-plan.ts";

const levels: Record<string, string> = { g: "Ground floor", l1: "Level 1" };
const levelName = (id: string) => levels[id] ?? null;
const plans = (levelId: string | null, materialId: string | null, qty: number, label = "Downlight"): CountedRow => ({ source: "PLANS", label, levelId, groupId: null, materialId, qty });
const quote = (materialId: string | null, qty: number, fromPlans = false, label = "Q-1001: Downlight"): CountedRow => ({ source: "QUOTE", label, levelId: null, groupId: "q1", materialId, qty, fromPlans });

test("plan icons add up to one line per material per level, named after the level", () => {
  const { lines } = addUp([plans("g", "dl", 6, "Downlight 1"), plans("g", "dl", 2, "Downlight 2"), plans("l1", "dl", 4), plans("g", "gpo", 3)], { plansBroughtIn: true, levelName });
  assert.deepEqual(
    lines.map((line) => [line.key, line.room, line.qty]),
    [
      ["PLANS:g:dl", "Ground floor", 8],
      ["PLANS:l1:dl", "Level 1", 4],
      ["PLANS:g:gpo", "Ground floor", 3],
    ],
  );
  assert.deepEqual(lines[0]!.from, ["Downlight 1", "Downlight 2"]);
});

test("on one level the room is left blank to fill in", () => {
  const { lines } = addUp([plans("g", "dl", 6), plans("g", "gpo", 3)], { plansBroughtIn: true, levelName });
  assert.deepEqual(lines.map((line) => line.room), [null, null]);
});

test("quote lines from the take-off are left out when the plans are brought in", () => {
  const rows = [quote("dl", 8, true), quote("fan", 2)];
  assert.deepEqual(addUp(rows, { plansBroughtIn: true, levelName }).lines.map((line) => [line.key, line.qty]), [["QUOTE:q1:fan", 2]]);
  assert.deepEqual(addUp(rows, { plansBroughtIn: false, levelName }).lines.map((line) => line.key), ["QUOTE:q1:dl", "QUOTE:q1:fan"]);
});

test("counts with no material are listed, not added", () => {
  const { lines, unlinked } = addUp([plans("g", null, 3, "Fan"), plans("l1", null, 1, "Fan"), plans("g", "dl", 0)], { plansBroughtIn: true, levelName });
  assert.equal(lines.length, 0);
  assert.deepEqual(unlinked, [{ source: "PLANS", label: "Fan", qty: 4 }]);
});

const existing = (id: string, sourceRef: string, qty: number | null, editedByHand = false, source: ExistingLine["source"] = "PLANS"): ExistingLine => ({ id, source, sourceRef, materialId: "dl", room: null, qty, editedByHand });

test("new, changed, gone and changed-by-hand lines", () => {
  const { lines } = addUp([plans("g", "dl", 26), plans("g", "gpo", 4), plans("g", "fan", 2), plans("g", "sw", 5)], { plansBroughtIn: true, levelName });
  const list = [
    existing("a", "g:dl", 24), // count changed
    existing("b", "g:gpo", 4), // the same
    existing("c", "g:old", 3), // gone
    existing("d", "g:sw", 6, true), // changed by hand
    existing("e", "g:gone", 1, true), // gone, but changed by hand
    existing("m", "anything", 9, false, "MANUAL"), // typed in: never touched
    existing("q", "q1:dl", 9, false, "QUOTE"), // a source not being compared
  ];
  const plan = planBringIn(lines, list, ["PLANS"]);
  assert.deepEqual(plan.add.map((line) => line.key), ["PLANS:g:fan"]);
  assert.deepEqual(plan.update.map(({ line, incoming }) => [line.id, line.qty, incoming.qty]), [["a", 24, 26]]);
  assert.deepEqual(plan.remove.map((line) => line.id), ["c"]);
  assert.deepEqual(plan.kept.map(({ line, incoming }) => [line.id, incoming?.qty ?? null]), [["d", 5], ["e", null]]);
  assert.deepEqual(choiceKeys(plan), ["add:PLANS:g:fan", "update:a", "remove:c"]);
});

test("a line cleared to TBC by hand is left alone", () => {
  const { lines } = addUp([plans("g", "dl", 6)], { plansBroughtIn: true, levelName });
  const plan = planBringIn(lines, [existing("a", "g:dl", null, true)], ["PLANS"]);
  assert.equal(plan.kept.length, 1);
  assert.equal(plan.update.length + plan.add.length + plan.remove.length, 0);
});
