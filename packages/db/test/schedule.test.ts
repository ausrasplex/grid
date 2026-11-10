import { test } from "node:test";
import assert from "node:assert/strict";
import { lastDue, nextDue } from "../src/schedule.ts";

const localTime = (text: string) => new Date(text); // local time
const daily = { schedule: "daily" as const, day: 0, time: "03:00" };

test("daily: last due is today after the time, yesterday before it", () => {
  assert.equal(lastDue(daily, localTime("2026-11-07T10:00"))!.getTime(), localTime("2026-11-07T03:00").getTime());
  assert.equal(lastDue(daily, localTime("2026-11-07T02:00"))!.getTime(), localTime("2026-11-06T03:00").getTime());
});

test("weekly on Sunday: last and next due", () => {
  const weekly = { schedule: "weekly" as const, day: 0, time: "03:00" };
  // 7 Nov 2026 is a Saturday.
  assert.equal(lastDue(weekly, localTime("2026-11-07T10:00"))!.getTime(), localTime("2026-11-01T03:00").getTime());
  assert.equal(nextDue(weekly, localTime("2026-11-07T10:00"))!.getTime(), localTime("2026-11-08T03:00").getTime());
});

test("off has no due times", () => {
  assert.equal(lastDue({ ...daily, schedule: "off" }, new Date()), null);
  assert.equal(nextDue({ ...daily, schedule: "off" }, new Date()), null);
});
