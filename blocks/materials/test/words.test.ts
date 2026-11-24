import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLink, cleanSwatch, materialMeta, priceBookName } from "../words.ts";
import { MATERIAL_TRADES, tradeForCompany, tradeName } from "../trades.ts";

test("a material's price list name carries its finish", () => {
  assert.equal(priceBookName({ name: "Iconic double switch", finish: "White" }), "Iconic double switch, White");
  assert.equal(priceBookName({ name: "Double GPO, white", finish: null }), "Double GPO, white");
});

test("the line under a material's name", () => {
  assert.equal(materialMeta({ name: "Downlight", brand: "Beacon Lighting", model: "MFL-1", finish: "White" }), "Beacon Lighting · MFL-1 · White");
  assert.equal(materialMeta({ name: "Downlight" }), "");
});

test("colour swatches are tidied or dropped", () => {
  assert.equal(cleanSwatch("#1F2937"), "#1f2937");
  assert.equal(cleanSwatch("fff"), "#ffffff");
  assert.equal(cleanSwatch("not a colour"), null);
  assert.equal(cleanSwatch(""), null);
});

test("links typed without https still open", () => {
  assert.equal(cleanLink("beacon.com.au/masson"), "https://beacon.com.au/masson");
  assert.equal(cleanLink("http://example.com"), "http://example.com");
  assert.equal(cleanLink("  "), null);
});

test("a business's trade picks its materials' starting trade", () => {
  assert.equal(tradeForCompany("ELECTRICAL"), "electrical");
  assert.equal(tradeForCompany("GASFITTING"), "gas");
  assert.equal(tradeForCompany("TILING"), "other");
  assert.equal(tradeForCompany(null), "other");
  assert.equal(tradeName("data"), "Data & comms");
  assert.equal(new Set(MATERIAL_TRADES.map((trade) => trade.id)).size, MATERIAL_TRADES.length);
});
