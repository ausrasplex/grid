import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, crossesToday, howLong, notSeenSince, seenBefore } from "../sighting.ts";

// Melbourne midday, so the local day is the date written.
const at = (day: string) => new Date(`${day}T02:00:00Z`);
const asset = (day: string, status = "IN_SERVICE") => ({ lastSeenAt: at(day), createdAt: at("2026-01-01"), status });

test("days add across months and years", () => {
  assert.equal(addDays("2026-11-28", 14), "2026-12-12");
  assert.equal(addDays("2026-12-25", 10), "2027-01-04");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("not seen only once more than the set days have passed", () => {
  assert.equal(notSeenSince(asset("2026-10-29"), 30, "2026-11-28"), null);
  assert.equal(notSeenSince(asset("2026-10-28"), 30, "2026-11-28"), "2026-10-28");
  assert.equal(notSeenSince(asset("2026-11-27"), 30, "2026-11-28"), null);
});

test("never moved or scanned counts from when it was added", () => {
  assert.equal(notSeenSince({ lastSeenAt: null, createdAt: at("2026-09-01"), status: "IN_SERVICE" }, 30, "2026-11-28"), "2026-09-01");
});

test("retired and lost gear is never 'not seen'", () => {
  assert.equal(notSeenSince(asset("2026-01-01", "RETIRED"), 30, "2026-11-28"), null);
  assert.equal(notSeenSince(asset("2026-01-01", "LOST"), 30, "2026-11-28"), null);
  assert.equal(notSeenSince(asset("2026-01-01", "OVERDUE"), 30, "2026-11-28"), "2026-01-01");
});

test("the email goes on the one morning it crosses the line", () => {
  // Seen 13 Nov; 14 days: still fine on the 27th, asks on the 28th, not again on the 29th.
  assert.equal(crossesToday(at("2026-11-13"), 14, "2026-11-27"), false);
  assert.equal(crossesToday(at("2026-11-13"), 14, "2026-11-28"), true);
  assert.equal(crossesToday(at("2026-11-13"), 14, "2026-11-29"), false);
  // The same day notSeenSince first says so.
  assert.equal(notSeenSince(asset("2026-11-13"), 14, "2026-11-28"), "2026-11-13");
  assert.equal(notSeenSince(asset("2026-11-13"), 14, "2026-11-27"), null);
});

test("the database filter never misses one", () => {
  const cutoff = seenBefore(30, "2026-11-28");
  assert.ok(at("2026-10-28") < cutoff);
  // Late on the 28th Oct in Melbourne is still the 28th, and still caught.
  assert.ok(new Date("2026-10-28T12:30:00Z") < cutoff);
});

test("how long reads naturally", () => {
  assert.equal(howLong("2026-11-14", "2026-11-28"), "2 weeks");
  assert.equal(howLong("2026-11-12", "2026-11-28"), "16 days");
  assert.equal(howLong("2026-09-01", "2026-11-28"), "2 months");
  assert.equal(howLong("2026-11-27", "2026-11-28"), "1 day");
});
