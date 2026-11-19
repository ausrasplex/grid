import { test } from "node:test";
import assert from "node:assert/strict";
import { TRADES, iconByKey, iconLabel, isIconKey, searchIcons, tradeOf } from "../icons.ts";

test("every icon key is unique and starts with its trade", () => {
  const keys = TRADES.flatMap((trade) => trade.icons.map((entry) => entry.key));
  assert.equal(new Set(keys).size, keys.length);
  for (const trade of TRADES) for (const entry of trade.icons) assert.ok(entry.key.startsWith(`${trade.id}.`), entry.key);
  assert.ok(TRADES.length >= 8);
});

test("looking up icons and their trade", () => {
  assert.equal(iconByKey("electrical.gpo-double")?.name, "Double GPO");
  assert.equal(tradeOf("fire.smoke")?.name, "Fire");
  assert.equal(isIconKey("electrical.nope"), false);
  assert.equal(iconLabel("electrical.gpo-double", 2, "Iconic"), "Double GPO 2 (Iconic)");
  assert.equal(iconLabel("electrical.gpo-double", null), "Double GPO");
});

test("searching finds icons by other words, across trades", () => {
  const found = searchIcons("power point");
  assert.ok(found.length === 1 && found[0]!.trade.id === "electrical");
  assert.ok(found[0]!.icons.some((entry) => entry.key === "electrical.gpo-double"));
  assert.ok(searchIcons("smoke").some((group) => group.trade.id === "fire"));
  assert.equal(searchIcons("").length, TRADES.length);
  assert.equal(searchIcons("zzzz").length, 0);
});
