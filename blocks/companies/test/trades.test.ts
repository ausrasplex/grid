import { test } from "node:test";
import assert from "node:assert/strict";
import { TRADES, tradeLabel, tradePreset } from "../trades.ts";

const ORIGINAL = ["BUILDER", "ELECTRICAL", "MECHANICAL", "CONTROLS_BMS", "PLUMBING", "FIRE", "CARPENTRY", "OTHER"];

test("every trade has a unique id and one of the presets", () => {
  const ids = TRADES.map((trade) => trade.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const trade of TRADES) assert.ok(ORIGINAL.includes(trade.preset), trade.id);
});

test("the original eight trades are still there (businesses already use them)", () => {
  for (const id of ORIGINAL) assert.ok(ids().includes(id), id);
});
const ids = () => TRADES.map((trade) => trade.id);

test("trades read well and borrow their preset", () => {
  assert.equal(tradeLabel("SOLAR"), "Solar & batteries");
  assert.equal(tradeLabel("SOMETHING_NEW"), "Something new");
  assert.equal(tradePreset("TILING"), "CARPENTRY");
  assert.equal(tradePreset("NOT_A_TRADE"), "OTHER");
});
