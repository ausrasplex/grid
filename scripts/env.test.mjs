// Every setting Grid reads must be settable from the Unraid template and
// documented in .env.example (the owner self-hosts with Unraid templates).
// Runs with `pnpm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

// Set by the image itself, by Node/Next, or for tests only.
const INTERNAL = new Set([
  "NODE_ENV", "NEXT_RUNTIME", "PORT", "HOSTNAME", "CONFIG_DIR", "FILES_ROOT", "BACKUPS_ROOT", "JOBS_TICK_CRON",
  // Set in the image; only changed for development.
  "CHROMIUM_PATH",
]);

function walk(directory, found = []) {
  for (const name of readdirSync(directory)) {
    if (["node_modules", ".next", "generated", "test"].includes(name)) continue;
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) walk(full, found);
    else if (/\.(ts|tsx|mjs)$/.test(name)) found.push(full);
  }
  return found;
}

function settingsUsed() {
  const names = new Set();
  for (const directory of ["apps", "blocks", "packages"]) {
    for (const filePath of walk(path.join(root, directory))) {
      for (const match of readFileSync(filePath, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(match[1]);
    }
  }
  const entry = readFileSync(path.join(root, "docker/entrypoint.sh"), "utf8");
  for (const match of entry.matchAll(/\$\{([A-Z][A-Z0-9_]*)[:}]/g)) names.add(match[1]);
  return [...names].filter((name) => !INTERNAL.has(name)).sort();
}

test("every setting is in the Unraid template", () => {
  const xml = readFileSync(path.join(root, "unraid/grid.xml"), "utf8");
  const targets = new Set([...xml.matchAll(/Target="([A-Z][A-Z0-9_]*)"/g)].map((match) => match[1]));
  const missing = settingsUsed().filter((name) => !targets.has(name));
  assert.deepEqual(missing, [], `Add these to unraid/grid.xml: ${missing.join(", ")}`);
});

test("every setting is in .env.example", () => {
  const env = readFileSync(path.join(root, ".env.example"), "utf8");
  const missing = settingsUsed().filter((name) => !new RegExp(`^#?\\s*${name}=`, "m").test(env));
  assert.deepEqual(missing, [], `Add these to .env.example: ${missing.join(", ")}`);
});

test("the Unraid templates are well-formed", () => {
  for (const templateFile of ["grid.xml", "grid-postgres.xml"]) {
    const xml = readFileSync(path.join(root, "unraid", templateFile), "utf8");
    assert.match(xml, /<Container version="2">[\s\S]*<\/Container>/);
    const opens = (xml.match(/<Config /g) ?? []).length;
    const closes = (xml.match(/<\/Config>/g) ?? []).length;
    assert.equal(opens, closes, `${templateFile}: every <Config> needs a </Config>`);
  }
});
