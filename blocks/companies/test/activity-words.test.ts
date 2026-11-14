import { test } from "node:test";
import assert from "node:assert/strict";
import { summaryOf, whatOf } from "../activity-words.ts";

test("activity lines read as plain English", () => {
  assert.equal(summaryOf("SiteNote", "deleted"), "Deleted a site note");
  assert.equal(summaryOf("Project", "created"), "Added a job");
  assert.equal(summaryOf("JobPhoto", "added"), "Added a photo");
  assert.equal(summaryOf("User", "email_changed"), "Account: email changed");
  assert.equal(summaryOf("Building", "basements_to_parking"), "Building: basements to parking");
});

test("the thing's name comes from the details when there is one", () => {
  assert.equal(whatOf({ title: "Lockbox", body: "4512" }), "Lockbox");
  assert.equal(whatOf({ before: { name: "Level 3" } }), "Level 3");
  assert.equal(whatOf({ from: "a@b.com", to: "c@d.com" }), "c@d.com");
  assert.equal(whatOf(null), null);
  assert.equal(whatOf(["x"]), null);
});
