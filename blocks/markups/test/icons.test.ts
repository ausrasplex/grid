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

test("custom icons join the library and look up like built-in ones", async () => {
  const { iconLookup, customKey, isCustomKey } = await import("../icons.ts");
  const id = "0d6e4a3c-6b1e-4f3a-9c55-3f2b8f0d1a22";
  const lookup = iconLookup([
    { id, trade: "electrical", name: "Bollard light", words: ["garden"], outline: "circle", label: "BL", svg: null, tint: false, replacesKey: null, deleted: false },
    { id: "1d6e4a3c-6b1e-4f3a-9c55-3f2b8f0d1a22", trade: "custom", name: "Gone", words: [], outline: "square", label: "G", svg: null, tint: false, replacesKey: null, deleted: true },
  ]);
  assert.ok(isCustomKey(customKey(id)));
  assert.equal(lookup.icon(customKey(id))?.name, "Bollard light");
  assert.equal(lookup.trade(customKey(id))?.name, "Electrical");
  assert.equal(lookup.icon("electrical.gpo-double")?.name, "Double GPO");
  assert.ok(lookup.search("garden")[0]!.icons.some((entry) => entry.key === customKey(id)));
  // Deleted ones leave the library but still draw where placed.
  assert.equal(lookup.search("gone").length, 0);
  assert.equal(lookup.icon("custom.1d6e4a3c-6b1e-4f3a-9c55-3f2b8f0d1a22")?.name, "Gone");
});

test("a built-in icon can be given the business's own look", async () => {
  const { iconLookup } = await import("../icons.ts");
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>';
  const lookup = iconLookup([
    { id: "2d6e4a3c-6b1e-4f3a-9c55-3f2b8f0d1a22", trade: "electrical", name: "Double GPO (ours)", words: [], outline: "circle", label: "", svg, tint: true, replacesKey: "electrical.gpo-double", deleted: false },
    { id: "3d6e4a3c-6b1e-4f3a-9c55-3f2b8f0d1a22", trade: "electrical", name: "Put back", words: [], outline: "square", label: "X", svg: null, tint: false, replacesKey: "electrical.gpo-single", deleted: true },
  ]);
  const replaced = lookup.icon("electrical.gpo-double")!;
  assert.equal(replaced.key, "electrical.gpo-double");
  assert.equal(replaced.name, "Double GPO (ours)");
  assert.equal(replaced.svg, svg);
  assert.equal(replaced.tint, true);
  assert.equal(lookup.trade("electrical.gpo-double")?.id, "electrical");
  // The library shows the new look in the built-in's place, once.
  const electrical = lookup.search("").find((group) => group.trade.id === "electrical")!;
  assert.equal(electrical.icons.filter((entry) => entry.key === "electrical.gpo-double").length, 1);
  assert.equal(electrical.icons.find((entry) => entry.key === "electrical.gpo-double")!.svg, svg);
  // A removed replacement: the built-in look is back.
  assert.equal(lookup.icon("electrical.gpo-single")?.svg, undefined);
  assert.equal(lookup.icon("electrical.gpo-single")?.name, "Single GPO");
});

test("a business's group colours reach every icon in the group", async () => {
  const { iconLookup, iconGroups, contrastOnWhite, customKey } = await import("../icons.ts");
  const id = "4d6e4a3c-6b1e-4f3a-9c55-3f2b8f0d1a22";
  const lookup = iconLookup([{ id, trade: "custom", name: "Bollard", words: [], outline: "circle", label: "B", svg: null, tint: false, replacesKey: null, deleted: false }], { electrical: "#111827", custom: "#0d9488", plumbing: "not a colour" });
  assert.equal(lookup.trade("electrical.gpo-double")?.colour, "#111827");
  assert.equal(lookup.trade(customKey(id))?.colour, "#0d9488");
  assert.equal(lookup.search("").find((group) => group.trade.id === "electrical")?.trade.colour, "#111827");
  assert.equal(lookup.groups[0]!.id, "custom");
  // A bad colour is ignored: the usual one stays.
  assert.equal(lookup.trade("plumbing.tap")?.colour ?? iconGroups().find((trade) => trade.id === "plumbing")!.colour, iconGroups().find((trade) => trade.id === "plumbing")!.colour);
  // Nothing changed: the built-in colours.
  assert.equal(iconLookup([]).trade("electrical.gpo-double")?.colour, "#dc2626");
  assert.ok(contrastOnWhite("#111827") > 15 && contrastOnWhite("#ffff00") < 3);
});
