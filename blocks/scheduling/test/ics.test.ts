import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarFile, escapeText, fold } from "../ics.ts";

test("text is escaped", () => {
  assert.equal(escapeText("Smith St, Brunswick; rough-in\nRing first"), "Smith St\\, Brunswick\; rough-in\\nRing first");
  assert.equal(escapeText("a\\b"), "a\\\\b");
});

test("long lines fold at 75 bytes without splitting a character", () => {
  const line = `SUMMARY:${"x".repeat(100)}`;
  const folded = fold(line);
  const parts = folded.split("\r\n");
  assert.equal(parts[0]!.length, 75);
  assert.ok(parts.slice(1).every((part) => part.startsWith(" ") && new TextEncoder().encode(part).length <= 75));
  assert.equal(folded.replace(/\r\n /g, ""), line);
  const emoji = `SUMMARY:${"½".repeat(60)}`;
  assert.equal(fold(emoji).replace(/\r\n /g, ""), emoji);
});

test("a timed visit, an all-day visit and time off", () => {
  const file = calendarFile(
    "Grid: Sam",
    [
      { uid: "visit-1@grid", summary: "Smith St reno: Rough-in", startsAt: new Date("2026-12-02T21:00:00Z"), endsAt: new Date("2026-12-02T23:00:00Z"), location: "12 Smith St, Brunswick VIC 3056", status: "CONFIRMED" },
      { uid: "visit-2@grid", summary: "Lee bathroom (Tentative)", firstDay: "2026-12-04", lastDay: "2026-12-05", status: "TENTATIVE" },
      { uid: "leave-1@grid", summary: "Away", firstDay: "2026-12-22", lastDay: "2026-12-31", busy: false },
    ],
    new Date("2026-11-28T00:00:00Z"),
  );
  assert.ok(file.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(file.endsWith("END:VCALENDAR\r\n"));
  assert.ok(file.includes("DTSTART:20261202T210000Z\r\nDTEND:20261202T230000Z"));
  assert.ok(file.includes("LOCATION:12 Smith St\\, Brunswick VIC 3056"));
  // All day: the end is the day after the last day.
  assert.ok(file.includes("DTSTART;VALUE=DATE:20261204\r\nDTEND;VALUE=DATE:20261206"));
  assert.ok(file.includes("DTEND;VALUE=DATE:20270101"));
  assert.ok(file.includes("STATUS:TENTATIVE"));
  assert.ok(file.includes("TRANSP:TRANSPARENT"));
  assert.equal((file.match(/BEGIN:VEVENT/g) ?? []).length, 3);
});
