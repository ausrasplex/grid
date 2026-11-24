import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanRoom, formatQty, groupSchedule, orderedRooms, roomKey } from "../schedule.ts";
import { columnsFor } from "../columns.ts";

const line = (trade: string, room: string | null, sortName: string, minute: number) => ({ trade, room, sortName, createdAt: new Date(2026, 10, 24, 9, minute) });

test("rooms are the same however they're typed", () => {
  assert.equal(roomKey("  Ensuite "), roomKey("ensuite"));
  assert.equal(cleanRoom("  Master   bedroom "), "Master bedroom");
  assert.equal(cleanRoom("   "), null);
});

test("rooms follow the job's order, then first used", () => {
  const lines = [line("electrical", "Kitchen", "a", 1), line("electrical", "garage", "b", 2), line("electrical", "Ensuite", "c", 3), line("electrical", "kitchen", "d", 4)];
  assert.deepEqual(orderedRooms(lines, []), ["Kitchen", "garage", "Ensuite"]);
  assert.deepEqual(orderedRooms(lines, ["Ensuite", "Laundry"]), ["Ensuite", "Kitchen", "garage"]);
});

test("grouped by trade, General first, items by name", () => {
  const lines = [
    line("plumbing", "Kitchen", "Mixer", 1),
    line("electrical", "Kitchen", "Pendant", 2),
    line("electrical", null, "Switchboard", 3),
    line("electrical", "Kitchen", "Downlight", 4),
    line("electrical", "Ensuite", "Exhaust fan", 5),
  ];
  const groups = groupSchedule(lines, { tradeOrder: ["electrical", "data", "plumbing"], roomOrder: [] });
  assert.deepEqual(groups.map((group) => group.trade), ["electrical", "plumbing"]);
  assert.deepEqual(groups[0]!.rooms.map((group) => group.room), [null, "Kitchen", "Ensuite"]);
  assert.deepEqual(groups[0]!.rooms[1]!.lines.map((entry) => entry.sortName), ["Downlight", "Pendant"]);
});

test("a quantity left blank prints TBC", () => {
  assert.equal(formatQty(null), "TBC");
  assert.equal(formatQty(12), "12");
  assert.equal(formatQty(2.5), "2.5");
});

test("columns follow the job's quantities switch and the business's hidden columns", () => {
  const keys = (options: Parameters<typeof columnsFor>[1]) => columnsFor("electrical", options).map((column) => column.key);
  assert.deepEqual(keys({ showQty: true, hidden: [], anyNotes: true }), ["item", "image", "product", "finish", "qty", "link", "notes"]);
  assert.deepEqual(keys({ showQty: false, hidden: ["link"], anyNotes: false }), ["item", "image", "product", "finish"]);
});
