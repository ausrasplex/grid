import { test } from "node:test";
import assert from "node:assert/strict";
import { disciplineOf, guessSheet, parseFileName, parseTitleBlock } from "../parse.ts";

const cases: [string, string, string, string][] = [
  ["E-101 Lighting Layout Rev C.pdf", "E-101", "Lighting Layout", "C"],
  ["E101_C_Lighting Layout.pdf", "E101", "Lighting Layout", "C"],
  ["1234-ELE-DWG-E101[C].pdf", "E101", "", "C"],
  ["E-102 Power Layout (B).pdf", "E-102", "Power Layout", "B"],
  ["SK-E-01-P2.pdf", "E-01", "", "P2"],
  ["E1.01 Ground Floor Lighting - Rev P3.pdf", "E1.01", "Ground Floor Lighting", "P3"],
  ["M-201 Level 2 Mechanical Services REV 4.pdf", "M-201", "Level 2 Mechanical Services", "4"],
  ["Switchboard schedule.pdf", "", "Switchboard schedule", ""],
  ["A-100.pdf", "A-100", "", ""],
  ["SK-01 Site sketch.png", "SK-01", "Site sketch", ""],
];

for (const [name, number, title, revision] of cases) {
  test(`parseFileName ${name}`, () => {
    const guess = parseFileName(name);
    assert.equal(guess.number, number);
    assert.equal(guess.title, title);
    assert.equal(guess.revision, revision);
  });
}

test("disciplineOf", () => {
  assert.equal(disciplineOf("E-101"), "E");
  assert.equal(disciplineOf("FP-03"), "FP");
  assert.equal(disciplineOf("EL-01"), "E");
  assert.equal(disciplineOf("X-1"), "");
});

test("parseTitleBlock finds number, revision and title", () => {
  const text = "PROJECT\nNew Childcare Centre\nDRAWING TITLE\nLEVEL 1 LIGHTING LAYOUT\nDRAWING NO.          REV\nE-110                C\nSCALE 1:100 @ A1";
  const titleBlock = parseTitleBlock(text);
  assert.equal(titleBlock.title, "LEVEL 1 LIGHTING LAYOUT");
  assert.equal(titleBlock.number, "E-110");
  assert.equal(titleBlock.discipline, "E");
  assert.equal(titleBlock.revision, "C");
});

test("guessSheet: the name wins for a single sheet; the title block fills gaps", () => {
  const guess = guessSheet("1234-ELE-DWG-E101[C].pdf", "DRAWING TITLE\nPOWER LAYOUT\nDRAWING NO: E-101\nREV: C");
  assert.deepEqual(guess, { number: "E-101", title: "POWER LAYOUT", revision: "C", discipline: "E" });
});

test("guessSheet: in a multi-page set the title block names each page", () => {
  const guess = guessSheet("Electrical set.pdf", "DRAWING NO: E-103\nDRAWING TITLE: DATA LAYOUT", 3, 8);
  assert.equal(guess.number, "E-103");
  assert.equal(guess.title, "DATA LAYOUT");
  const blank = guessSheet("Electrical set.pdf", "", 3, 8);
  assert.equal(blank.number, "Sheet 3");
});

test("parseTitleBlock: a table title block from a real PDF (pdftotext -layout)", () => {
  const text = [
    "                                                                PROJECT",
    "                                                                NEW CHILDCARE CENTRE",
    "                                                                DRAWING TITLE",
    "                                                                LEVEL 1 DATA LAYOUT",
    "                                                                DRAWING NO.            SCALE 1:100 @ A1      REV",
    "                                                                E-103                                        A",
  ].join("\n");
  assert.deepEqual(parseTitleBlock(text), { number: "E-103", revision: "A", title: "LEVEL 1 DATA LAYOUT", discipline: "E" });
});
