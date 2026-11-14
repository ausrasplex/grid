import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntil, expiryWords, reminderDue, ticketStatus } from "../types.ts";

test("a ticket's status from its expiry date", () => {
  assert.deepEqual(ticketStatus(null, "2026-11-15"), { status: "no-expiry", daysLeft: null });
  assert.deepEqual(ticketStatus("2027-06-01", "2026-11-15"), { status: "current", daysLeft: 198 });
  assert.deepEqual(ticketStatus("2026-12-15", "2026-11-15"), { status: "soon", daysLeft: 30 });
  assert.deepEqual(ticketStatus("2026-11-15", "2026-11-15"), { status: "soon", daysLeft: 0 });
  assert.deepEqual(ticketStatus("2026-11-14", "2026-11-15"), { status: "expired", daysLeft: -1 });
  assert.equal(daysUntil("2027-01-01", "2026-12-31"), 1);
});

test("reminders go at 60, 30 and 7 days and on the day, once each", () => {
  assert.equal(reminderDue(90, null), null);
  assert.equal(reminderDue(60, null), 60);
  assert.equal(reminderDue(45, 60), null);
  assert.equal(reminderDue(30, 60), 30);
  assert.equal(reminderDue(25, null), 30); // added late: the nearest one
  assert.equal(reminderDue(5, 30), 7);
  assert.equal(reminderDue(0, 7), 0);
  assert.equal(reminderDue(-10, 7), 0); // already past and never told
  assert.equal(reminderDue(-10, 0), null);
});

test("expiry in words", () => {
  assert.equal(expiryWords(null), "Doesn't expire");
  assert.equal(expiryWords(0), "Expires today");
  assert.equal(expiryWords(1), "Expires tomorrow");
  assert.equal(expiryWords(23), "Expires in 23 days");
  assert.equal(expiryWords(-1), "Expired yesterday");
  assert.equal(expiryWords(-3), "Expired 3 days ago");
});
