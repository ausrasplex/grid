import { test } from "node:test";
import assert from "node:assert/strict";
import { findWords, pageText, parseBbox } from "../src/pdf-text.ts";

const sample = `<!DOCTYPE html><html><body><doc>
<page width="600.000000" height="800.000000">
    <word xMin="60.000000" yMin="80.000000" xMax="120.000000" yMax="96.000000">RCBO</word>
    <word xMin="126.000000" yMin="80.000000" xMax="150.000000" yMax="96.000000">40A</word>
    <word xMin="156.000000" yMin="80.000000" xMax="180.000000" yMax="96.000000">trip</word>
    <word xMin="186.000000" yMin="80.000000" xMax="240.000000" yMax="96.000000">curve,</word>
    <word xMin="60.000000" yMin="100.000000" xMax="90.000000" yMax="116.000000">R&amp;D</word>
</page>
<page width="600.000000" height="800.000000">
</page>
<page width="600.000000" height="800.000000">
    <word xMin="300.000000" yMin="400.000000" xMax="360.000000" yMax="416.000000">Trip</word>
    <word xMin="366.000000" yMin="400.000000" xMax="420.000000" yMax="416.000000">Curves</word>
</page>
</doc></body></html>`;

test("parseBbox reads each page's words as fractions of the page", () => {
  const pages = parseBbox(sample);
  assert.equal(pages.length, 3);
  assert.deepEqual(pages[0]!.words[0], [0.1, 0.1, 0.2, 0.12, "RCBO"]);
  assert.equal(pages[0]!.words[4]![4], "R&D");
  assert.equal(pages[1]!.words.length, 0);
  assert.equal(pageText(pages[0]!), "RCBO 40A trip curve, R&D");
});

test("findWords finds words in order across pages, ignoring case and punctuation", () => {
  const pages = parseBbox(sample);
  const matches = findWords(pages, "trip curve");
  assert.deepEqual(matches.map((match) => match.page), [1, 3]);
  assert.equal(matches[0]!.boxes.length, 2);
  assert.deepEqual(findWords(pages, "40a").map((match) => match.page), [1]);
  assert.deepEqual(findWords(pages, "rcbo 40a trip").map((match) => match.boxes.length), [3]);
  assert.deepEqual(findWords(pages, "missing"), []);
  assert.deepEqual(findWords(pages, "  "), []);
});
