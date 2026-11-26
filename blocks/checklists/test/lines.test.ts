import { test } from "node:test";
import assert from "node:assert/strict";
import { itemsFromText, showOrder } from "../lines.ts";

test("one item per line, with pasted bullets, numbers and boxes taken off", () => {
  assert.deepEqual(itemsFromText("Rough-in Level 2"), ["Rough-in Level 2"]);
  assert.deepEqual(
    itemsFromText("- Pull cables to DB\n• Fit off kitchen\n\n2. Test & tag leads\n[ ] Label circuits\n[x] Order RCDs\n☐ Book inspection\n  "),
    ["Pull cables to DB", "Fit off kitchen", "Test & tag leads", "Label circuits", "Order RCDs", "Book inspection"],
  );
  assert.deepEqual(itemsFromText("   \n\n"), []);
  // A number that's part of the job stays.
  assert.deepEqual(itemsFromText("240V outlets in garage"), ["240V outlets in garage"]);
});

test("to do in list order, then done with the latest first", () => {
  const items = [
    { id: "a", position: 1, doneAt: "2026-11-26T03:00:00Z" },
    { id: "b", position: 2, doneAt: null },
    { id: "c", position: 3, doneAt: "2026-11-26T05:00:00Z" },
    { id: "d", position: 0, doneAt: null },
  ];
  const { todo, done } = showOrder(items);
  assert.deepEqual(todo.map((item) => item.id), ["d", "b"]);
  assert.deepEqual(done.map((item) => item.id), ["c", "a"]);
});
