import { test } from "node:test";
import assert from "node:assert/strict";
import { addressKey, levelShortName, siteNameFromAddress, standardLevels } from "../address.ts";

test("addresses written differently match", () => {
  const key = addressKey("12 Smith Street, Brunswick VIC 3056");
  assert.equal(key, addressKey("12 smith st  brunswick vic 3056"));
  assert.equal(key, addressKey("12 Smith St., Brunswick, Victoria 3056"));
  assert.notEqual(key, addressKey("14 Smith St, Brunswick VIC 3056"));
});

test("unit numbers are kept", () => {
  assert.equal(addressKey("Unit 2, 12 Smith Street"), addressKey("2/12 Smith St"));
  assert.notEqual(addressKey("2/12 Smith St"), addressKey("12 Smith St"));
});

test("site names come from the first part of the address", () => {
  assert.equal(siteNameFromAddress("12 Smith Street, Brunswick VIC 3056"), "12 Smith St");
});

test("level short names", () => {
  assert.equal(levelShortName("Level 5"), "L5");
  assert.equal(levelShortName("Ground"), "G");
  assert.equal(levelShortName("Basement 2"), "B2");
  assert.equal(levelShortName("Roof"), "Roof");
});

test("standard levels run top to bottom", () => {
  assert.deepEqual(standardLevels({ above: 2, basements: 1, roof: true }), ["Roof", "Level 2", "Level 1", "Ground", "Basement"]);
});
