import { test } from "node:test";
import assert from "node:assert/strict";
import { codeFromScan, generateRouteCode } from "../src/route-codes.ts";

test("the scanner finds the code in a link, a tag address or typing", () => {
  assert.equal(codeFromScan("https://grid.example.com.au/go/92MF-4TD8"), "92MF-4TD8");
  assert.equal(codeFromScan("http://192.168.1.20:3000/go/K7QX-92MF-4TD8"), "K7QX-92MF-4TD8");
  assert.equal(codeFromScan("https://tag.example.com.au/K7QX-92MF-4TD8"), "K7QX-92MF-4TD8");
  assert.equal(codeFromScan("92mf 4td8"), "92MF-4TD8");
  assert.equal(codeFromScan("92mf4td8"), "92MF-4TD8");
  assert.equal(codeFromScan(generateRouteCode("K7QX"))?.length, 14);
});

test("other things aren't codes", () => {
  assert.equal(codeFromScan("9300601234567"), null); // a product barcode
  assert.equal(codeFromScan("https://example.com/products/drill"), null);
  assert.equal(codeFromScan("TT-000123"), null);
  assert.equal(codeFromScan("hello"), null);
});
