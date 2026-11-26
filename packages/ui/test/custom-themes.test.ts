import { test } from "node:test";
import assert from "node:assert/strict";
import { STARTERS, contrast, deriveTokens, readabilityWarnings, resolveTokens, tokensCss, type KeyColours } from "../src/lib/custom-themes.ts";

test("contrast: black on white is 21, a colour on itself is 1", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
  assert.equal(contrast("#f7d22a", "#f7d22a"), 1);
});

test("every built-in starter is easy to read", () => {
  for (const starter of STARTERS) {
    const tokens = deriveTokens(starter.keyColours, starter.look);
    assert.deepEqual(readabilityWarnings(tokens, starter.look), [], starter.label);
  }
});

test("button text flips to dark on a light main colour and white on a dark one", () => {
  const grid = STARTERS[0]!.keyColours;
  assert.equal(deriveTokens({ ...grid, main: "#ffee00" }, "grid")["primary-foreground"], "#15171b");
  assert.equal(deriveTokens({ ...grid, main: "#1a237e" }, "grid")["primary-foreground"], "#ffffff");
});

test("a hard-to-read pick is warned about", () => {
  const key: KeyColours = { ...STARTERS[1]!.keyColours, text: "#e0e0e0" };
  const warnings = readabilityWarnings(deriveTokens(key, "grid"), "grid");
  assert.ok(warnings.some((warning) => warning.label === "Text on cards"));
});

test("overrides win, but only good hex colours and known tokens", () => {
  const key = STARTERS[0]!.keyColours;
  const tokens = resolveTokens(key, "grid", { border: "#ABCDEF", ring: "red; } body { display:none", nonsense: "#000000" } as never);
  assert.equal(tokens.border, "#abcdef");
  assert.equal(tokens.ring, key.main);
  assert.equal("nonsense" in tokens, false);
});

test("the stylesheet only ever holds hex colours", () => {
  const css = tokensCss(resolveTokens(STARTERS[2]!.keyColours, "soft"));
  assert.match(css, /^:root\[data-theme="custom"\]\{color-scheme:light;--background:#f1f1f4;/);
  assert.doesNotMatch(css.replace(/#[0-9a-f]{6}/g, ""), /[#<>]/);
});
