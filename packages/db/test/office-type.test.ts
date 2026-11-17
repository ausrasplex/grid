import { test } from "node:test";
import assert from "node:assert/strict";
import { officeType } from "../src/files.ts";

const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const ole = Buffer.from("d0cf11e0a1b11ae1", "hex");

test("Office files are known by name and first bytes together", () => {
  assert.equal(officeType(zip, "Points list.xlsx")?.ext, "xlsx");
  assert.equal(officeType(zip, "Spec.DOCX")?.mime, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(officeType(ole, "Old schedule.xls")?.mime, "application/vnd.ms-excel");
  assert.equal(officeType(Buffer.from("Point,Tag\nAHU-1,T1\n"), "points.csv")?.mime, "text/csv");
});

test("a file pretending to be something else is refused", () => {
  assert.equal(officeType(zip, "photo.jpg"), null);
  assert.equal(officeType(ole, "points.xlsx"), null);
  assert.equal(officeType(zip, "points.csv"), null);
  assert.equal(officeType(Buffer.from("MZ\x90\x00"), "setup.docx"), null);
  assert.equal(officeType(zip, "no-extension"), null);
});
