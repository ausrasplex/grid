import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, isOverdue, isTestAndTag, mostUrgent, nextInspectionDue, routineDue, tagColourFor } from "../due.ts";

const testAndTag = { id: "tt", everyMonths: 3, mustPass: true };
const service = { id: "sv", everyMonths: 12, mustPass: false };

test("months are added, kept to the end of a shorter month", () => {
  assert.equal(addMonths("2026-11-26", 3), "2027-02-26");
  assert.equal(addMonths("2027-01-31", 1), "2027-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-08-31", 6), "2027-02-28");
});

test("a routine counts from the latest check that covered it", () => {
  const checks = [
    { date: "2026-06-01", routineIds: ["tt"], result: "PASS" as const },
    { date: "2026-09-01", routineIds: ["tt", "sv"], result: "PASS" as const },
  ];
  assert.deepEqual(routineDue(testAndTag, checks, "2026-10-01"), { tone: "ok", text: "Due 1 Dec 2026", dueOn: "2026-12-01" });
  assert.equal(routineDue(testAndTag, checks, "2026-11-20").text, "Due in 11 days");
  assert.equal(routineDue(testAndTag, checks, "2026-12-01").text, "Due today");
  assert.deepEqual(routineDue(testAndTag, checks, "2026-12-05"), { tone: "overdue", text: "Overdue · 4 days late", dueOn: "2026-12-01" });
});

test("only a pass counts for a must-pass routine; any check counts for a service", () => {
  const checks = [
    { date: "2026-06-01", routineIds: ["tt", "sv"], result: "PASS" as const },
    { date: "2026-09-01", routineIds: ["tt", "sv"], result: "FAIL" as const },
  ];
  assert.equal(routineDue(testAndTag, checks, "2026-09-10").dueOn, "2026-09-01");
  assert.equal(routineDue(service, checks, "2026-09-10").dueOn, "2027-09-01");
});

test("never done reads 'Not done yet' and doesn't block new gear", () => {
  assert.deepEqual(routineDue(testAndTag, [], "2026-11-26"), { tone: "soon", text: "Not done yet", dueOn: null });
  assert.equal(routineDue(service, [], "2026-11-26").text, "Not logged yet");
  assert.equal(nextInspectionDue([testAndTag], []), null);
  assert.equal(routineDue({ id: "x", everyMonths: null, mustPass: false }, [], "2026-11-26").tone, "none");
});

test("the asset keeps the soonest must-pass due date", () => {
  const harness = { id: "hn", everyMonths: 6, mustPass: true };
  const checks = [
    { date: "2026-10-01", routineIds: ["tt"], result: "PASS" as const },
    { date: "2026-05-01", routineIds: ["hn"], result: "PASS" as const },
    { date: "2026-01-01", routineIds: ["sv"], result: "PASS" as const },
  ];
  assert.equal(nextInspectionDue([testAndTag, harness, service], checks), "2026-11-01");
  assert.equal(isOverdue("2026-11-01", "2026-11-01"), false);
  assert.equal(isOverdue("2026-11-01", "2026-11-02"), true);
  assert.equal(isOverdue(null, "2026-11-02"), false);
});

test("the most urgent chip: overdue first, then the soonest", () => {
  assert.equal(
    mostUrgent([
      { tone: "ok", text: "a", dueOn: "2027-01-01" },
      { tone: "soon", text: "b", dueOn: "2026-12-10" },
      { tone: "soon", text: "c", dueOn: "2026-12-02" },
    ])?.text,
    "c",
  );
  assert.equal(mostUrgent([{ tone: "soon", text: "b", dueOn: null }, { tone: "overdue", text: "d", dueOn: "2026-10-01" }])?.text, "d");
  assert.equal(mostUrgent([{ tone: "ok", text: "a", dueOn: "2027-01-01" }]), null);
});

test("test & tag colours follow the season", () => {
  assert.equal(tagColourFor("2026-12-03"), "RED");
  assert.equal(tagColourFor("2027-02-28"), "RED");
  assert.equal(tagColourFor("2027-03-01"), "GREEN");
  assert.equal(tagColourFor("2027-07-15"), "BLUE");
  assert.equal(tagColourFor("2027-10-15"), "YELLOW");
  assert.equal(isTestAndTag("Test & tag"), true);
  assert.equal(isTestAndTag("Test and Tag"), true);
  assert.equal(isTestAndTag("Annual service"), false);
});
