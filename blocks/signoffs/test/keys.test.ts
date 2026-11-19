import { test } from "node:test";
import assert from "node:assert/strict";
import { guessMatchColumn, matchColumnFor, rowKeys, rowStates, type SignoffEntry } from "../keys.ts";

const sheet = [
  ["Points list, Level 2"],
  ["Point Name", "Type", "Controller"],
  ["AHU-1-SAT", "AI", "C1"],
  ["AHU-1-RAT", "AI", "C1"],
  ["", "", ""],
  ["AHU-1-FAN", "DO", "C2"],
];

test("Grid guesses the match column from the header", () => {
  assert.equal(guessMatchColumn(sheet, 1), "Point Name");
  // A column that repeats a lot can't name rows.
  assert.equal(guessMatchColumn([["Type", "Value"], ["AI", "1"], ["AI", "2"], ["AI", "3"]], 0), null);
});

test("a saved setting: null is the guess, empty is the whole row, a header that's gone falls back to the whole row", () => {
  assert.equal(matchColumnFor(sheet, 1, null), "Point Name");
  assert.equal(matchColumnFor(sheet, 1, ""), null);
  assert.equal(matchColumnFor(sheet, 1, "controller"), "controller");
  assert.equal(matchColumnFor(sheet, 1, "Circuit"), null);
});

test("rows keep their key when a new version reorders and adds rows", () => {
  const before = rowKeys(sheet, 1, "Point Name");
  assert.deepEqual(before, [null, null, "c:ahu 1 sat", "c:ahu 1 rat", null, "c:ahu 1 fan"]);
  const after = rowKeys([sheet[0]!, sheet[1]!, ["AHU-1-FAN", "DO", "C2"], ["AHU-1-NEW", "AI", "C1"], ["AHU-1-SAT", "AI", "C1"]], 1, "Point Name");
  assert.deepEqual(after, [null, null, "c:ahu 1 fan", "c:ahu 1 new", "c:ahu 1 sat"]);
});

test("repeated values are numbered, and whole-row keys are the same everywhere", () => {
  const keys = rowKeys([["Tag"], ["A"], ["A"], ["B"]], 0, "Tag");
  assert.deepEqual(keys, [null, "c:a", "c:a#2", "c:b"]);
  const whole = rowKeys(sheet, 1, null);
  assert.equal(whole[2], rowKeys(sheet, 1, null)[2]);
  assert.match(whole[2]!, /^h:[0-9a-f]{8}$/);
  assert.notEqual(whole[2], whole[3]);
});

test("the first sign-off stands, an undo clears it, and the history keeps everything", () => {
  const entry = (id: string, signedOff: boolean, at: string, byName = "Sam"): SignoffEntry => ({ id, sheetName: "Points", rowKey: "c:a", signedOff, note: null, rowText: "A", byId: byName, byName, at });
  const states = rowStates([entry("2", true, "2026-11-19T10:05:00Z", "Jo"), entry("1", true, "2026-11-19T10:00:00Z")], "Points");
  assert.equal(states.get("c:a")!.by!.byName, "Sam");
  assert.equal(states.get("c:a")!.history.length, 2);
  const undone = rowStates([entry("1", true, "2026-11-19T10:00:00Z"), entry("3", false, "2026-11-19T11:00:00Z")], "Points");
  assert.equal(undone.get("c:a")!.signedOff, false);
  assert.equal(rowStates([entry("1", true, "2026-11-19T10:00:00Z")], "Other").size, 0);
});
