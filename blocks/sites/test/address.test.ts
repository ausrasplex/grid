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

test("a building can't have two levels with the same name", async () => {
  const { levelNameClashes } = await import("../address.ts");
  assert.deepEqual(levelNameClashes(["Ground", "Level 1"], ["Level 2", "Level 3"]), []);
  assert.deepEqual(levelNameClashes(["Ground", "Level 1"], ["level  1", "Level 2"]), ["level  1"]);
  assert.deepEqual(levelNameClashes([], ["Roof", "Roof", "ROOF"]), ["Roof"]);
  assert.deepEqual(levelNameClashes(["Ground"], [" Ground "]), ["Ground"]);
});

test("short names are kept unique in a building", async () => {
  const { uniqueShortName } = await import("../address.ts");
  assert.equal(uniqueShortName("L1", ["G", "L2"]), "L1");
  assert.equal(uniqueShortName("Carp", ["Carp"]), "Carp2");
  assert.equal(uniqueShortName("Carp", ["carp", "Carp2"]), "Carp3");
  assert.equal(uniqueShortName("Podium12", ["Podium12"]), "Podium13"); // kept to 8 letters
});

test("basements can be car parking levels", async () => {
  const { basementAsParking } = await import("../address.ts");
  assert.deepEqual(standardLevels({ above: 1, basements: 2, roof: false, below: "parking" }), ["Level 1", "Ground", "Parking 1", "Parking 2"]);
  assert.deepEqual(standardLevels({ above: 1, basements: 1, roof: false, below: "parking" }), ["Level 1", "Ground", "Parking 1"]);
  assert.equal(levelShortName("Parking 2"), "P2");
  assert.equal(levelShortName("Car park 1"), "P1");
  assert.equal(levelShortName("Carpark level 3"), "P3");
  assert.equal(levelShortName("p4"), "P4");
  assert.equal(basementAsParking("Basement 2"), "Parking 2");
  assert.equal(basementAsParking("Basement"), "Parking 1");
  assert.equal(basementAsParking("Level 1"), null);
});

test("a floor can say what it's used for", async () => {
  const { levelLabel } = await import("../address.ts");
  assert.equal(levelShortName("Level 40 Plant room"), "L40");
  assert.equal(levelShortName("Level 40 - Plant room"), "L40");
  assert.equal(levelShortName("Level 400"), "L400");
  assert.equal(levelShortName("Basement 2 Storage"), "B2");
  assert.equal(levelLabel({ name: "Level 40", use: "Plant room" }), "Level 40 · Plant room");
  assert.equal(levelLabel({ name: "Level 40", use: null }), "Level 40");
});
