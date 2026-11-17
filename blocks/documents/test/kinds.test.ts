import { test } from "node:test";
import assert from "node:assert/strict";
import { documentKind, titleFromFileName } from "../kinds.ts";

test("titles come from file names", () => {
  assert.equal(titleFromFileName("RT-200_Install_Guide_v3.pdf"), "RT-200 Install Guide v3");
  assert.equal(titleFromFileName("Level 2 points list.xlsx"), "Level 2 points list");
  assert.equal(titleFromFileName("  .pdf"), "Document");
  assert.equal(titleFromFileName(null), "Document");
  assert.equal(titleFromFileName("A".repeat(300) + ".pdf").length, 160);
});

test("the viewer knows each kind of file", () => {
  assert.equal(documentKind("application/pdf"), "pdf");
  assert.equal(documentKind("image/jpeg"), "image");
  assert.equal(documentKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "spreadsheet");
  assert.equal(documentKind("text/csv"), "spreadsheet");
  assert.equal(documentKind("application/msword"), "word");
  assert.equal(documentKind("application/zip"), "other");
});
