import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, daysBetween, daysCovered, localDay, localTime, overlaps, timeOffClashes, timeOffLength, weekStart, zonedMoment } from "../times.ts";

const MELBOURNE = "Australia/Melbourne";

test("a local time becomes the right moment, either side of daylight saving", () => {
  // December: AEDT, UTC+11.
  assert.equal(zonedMoment("2026-12-03", "08:00", MELBOURNE).toISOString(), "2026-12-02T21:00:00.000Z");
  // June: AEST, UTC+10.
  assert.equal(zonedMoment("2026-06-03", "08:00", MELBOURNE).toISOString(), "2026-06-02T22:00:00.000Z");
  // The morning daylight saving starts (4 Oct 2026, 2 am → 3 am).
  assert.equal(zonedMoment("2026-10-04", "09:00", MELBOURNE).toISOString(), "2026-10-03T22:00:00.000Z");
});

test("and back again", () => {
  const moment = zonedMoment("2026-12-03", "14:30", MELBOURNE);
  assert.equal(localDay(moment, MELBOURNE), "2026-12-03");
  assert.equal(localTime(moment, MELBOURNE), "14:30");
  assert.equal(localTime(zonedMoment("2026-12-03", "00:00", MELBOURNE), MELBOURNE), "00:00");
});

test("days and weeks", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(weekStart("2026-12-03"), "2026-11-30"); // Thursday → Monday
  assert.equal(weekStart("2026-12-06"), "2026-11-30"); // Sunday → the Monday before
  assert.equal(weekStart("2026-11-30"), "2026-11-30");
  assert.deepEqual(daysBetween("2026-12-30", "2027-01-01"), ["2026-12-30", "2026-12-31", "2027-01-01"]);
});

test("an all-day visit ending at midnight covers only its days", () => {
  const startsAt = zonedMoment("2026-12-02", "00:00", MELBOURNE);
  const endsAt = zonedMoment("2026-12-04", "00:00", MELBOURNE);
  assert.deepEqual(daysCovered(startsAt, endsAt, MELBOURNE), ["2026-12-02", "2026-12-03"]);
  const short = zonedMoment("2026-12-02", "08:00", MELBOURNE);
  assert.deepEqual(daysCovered(short, new Date(short.getTime() + 2 * 3_600_000), MELBOURNE), ["2026-12-02"]);
});

test("back-to-back visits don't overlap", () => {
  const at = (time: string) => zonedMoment("2026-12-02", time, MELBOURNE);
  assert.equal(overlaps(at("08:00"), at("10:00"), at("10:00"), at("12:00")), false);
  assert.equal(overlaps(at("08:00"), at("10:30"), at("10:00"), at("12:00")), true);
});

test("time off gets in the way only where it is", () => {
  const visit = (day: string, from: string, to: string, isAllDay = false) => ({ startsAt: zonedMoment(day, from, MELBOURNE), endsAt: zonedMoment(day, to, MELBOURNE), isAllDay });
  const holidays = { startsOn: "2026-12-22", endsOn: "2027-01-05", firstDayPart: "WHOLE" as const, lastDayPart: "WHOLE" as const };
  assert.equal(timeOffClashes(holidays, visit("2026-12-24", "08:00", "10:00"), MELBOURNE), true);
  assert.equal(timeOffClashes(holidays, visit("2026-12-21", "08:00", "10:00"), MELBOURNE), false);
  assert.equal(timeOffClashes(holidays, visit("2027-01-06", "08:00", "10:00"), MELBOURNE), false);

  // An afternoon off leaves the morning free.
  const afternoon = { startsOn: "2026-12-03", endsOn: "2026-12-03", firstDayPart: "AFTERNOON" as const, lastDayPart: "AFTERNOON" as const };
  assert.equal(timeOffClashes(afternoon, visit("2026-12-03", "08:00", "11:30"), MELBOURNE), false);
  assert.equal(timeOffClashes(afternoon, visit("2026-12-03", "11:00", "13:00"), MELBOURNE), true);
  assert.equal(timeOffClashes(afternoon, visit("2026-12-03", "00:00", "00:00", true), MELBOURNE), true);

  // A morning off on the first day of a longer break.
  const fromLunch = { startsOn: "2026-12-03", endsOn: "2026-12-05", firstDayPart: "AFTERNOON" as const, lastDayPart: "MORNING" as const };
  assert.equal(timeOffClashes(fromLunch, visit("2026-12-05", "13:00", "15:00"), MELBOURNE), false);
  assert.equal(timeOffClashes(fromLunch, visit("2026-12-05", "09:00", "10:00"), MELBOURNE), true);
  assert.equal(timeOffClashes(fromLunch, visit("2026-12-04", "13:00", "15:00"), MELBOURNE), true);
});

test("time off reads as days, with halves", () => {
  assert.equal(timeOffLength({ startsOn: "2026-12-22", endsOn: "2026-12-31", firstDayPart: "WHOLE", lastDayPart: "WHOLE" }), "10 days");
  assert.equal(timeOffLength({ startsOn: "2026-12-03", endsOn: "2026-12-03", firstDayPart: "AFTERNOON", lastDayPart: "AFTERNOON" }), "½ day");
  assert.equal(timeOffLength({ startsOn: "2026-12-03", endsOn: "2026-12-05", firstDayPart: "AFTERNOON", lastDayPart: "WHOLE" }), "2½ days");
  assert.equal(timeOffLength({ startsOn: "2026-12-03", endsOn: "2026-12-03", firstDayPart: "WHOLE", lastDayPart: "WHOLE" }), "1 day");
});

test("days and times read the Australian way", async () => {
  const { dayWords, timeWords, whenWords, lengthWords } = await import("../words.ts");
  assert.equal(dayWords("2026-12-03", 2026), "Thu 3 Dec");
  assert.equal(dayWords("2027-01-04", 2026), "Mon 4 Jan 2027");
  assert.equal(timeWords("08:00"), "8:00 am");
  assert.equal(timeWords("12:30"), "12:30 pm");
  assert.equal(timeWords("00:15"), "12:15 am");
  assert.equal(whenWords({ isAllDay: false, day: "2026-12-03", lastDay: "2026-12-03", startTime: "08:00", endTime: "10:00" }), "8:00 am – 10:00 am");
  assert.equal(whenWords({ isAllDay: true, day: "2026-12-02", lastDay: "2026-12-04", startTime: "00:00", endTime: "00:00" }).startsWith("All day, Wed 2 Dec – Fri 4 Dec"), true);
  assert.equal(lengthWords(90), "1½ hours");
  assert.equal(lengthWords(120), "2 hours");
  assert.equal(lengthWords(45), "45 minutes");
});

test("some hours off only blocks those hours", () => {
  const visit = (from: string, to: string, isAllDay = false) => ({ startsAt: zonedMoment("2026-12-03", from, MELBOURNE), endsAt: zonedMoment("2026-12-03", to, MELBOURNE), isAllDay });
  const dentist = { startsOn: "2026-12-03", endsOn: "2026-12-03", firstDayPart: "HOURS" as const, lastDayPart: "HOURS" as const, fromTime: "13:00", toTime: "15:00" };
  assert.equal(timeOffClashes(dentist, visit("08:00", "12:00"), MELBOURNE), false);
  assert.equal(timeOffClashes(dentist, visit("12:00", "13:00"), MELBOURNE), false);
  assert.equal(timeOffClashes(dentist, visit("12:30", "13:30"), MELBOURNE), true);
  assert.equal(timeOffClashes(dentist, visit("15:00", "16:00"), MELBOURNE), false);
  assert.equal(timeOffClashes(dentist, visit("00:00", "00:00", true), MELBOURNE), true);
  // Some hours without times is treated as the whole day.
  assert.equal(timeOffClashes({ ...dentist, fromTime: null, toTime: null }, visit("08:00", "09:00"), MELBOURNE), true);
  assert.equal(timeOffLength(dentist), "2 hours");
  assert.equal(timeOffLength({ ...dentist, toTime: "14:30" }), "1½ hours");
  assert.equal(timeOffLength({ ...dentist, toTime: "13:30" }), "30 minutes");
});
