import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { folderBytes } from "../src/files.ts";

test("folderBytes adds up every file under a folder, sub-folders included", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "grid-bytes-"));
  try {
    await writeFile(path.join(folder, "thumb.jpg"), Buffer.alloc(100));
    await mkdir(path.join(folder, "plan_files", "12"), { recursive: true });
    await writeFile(path.join(folder, "plan_files", "12", "0_0.jpeg"), Buffer.alloc(250));
    await writeFile(path.join(folder, "plan_files", "12", "0_1.jpeg"), Buffer.alloc(50));
    assert.equal(await folderBytes(folder), 400);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("folderBytes is 0 for a folder that isn't there (never drawn, or cleared)", async () => {
  assert.equal(await folderBytes(path.join(tmpdir(), "grid-bytes-missing-folder")), 0);
});
