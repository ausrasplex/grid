// Copies each block's schema.prisma into prisma/schema/block.<id>.prisma
// so Prisma sees one schema folder. Run before generate/migrate
// (the package.json db:* scripts do this for you). The copies are
// git-ignored: always edit blocks/<id>/schema.prisma.
import { readdirSync, existsSync, rmSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const blocksDir = join(root, "blocks");
const outDir = join(root, "prisma", "schema");

for (const fileName of readdirSync(outDir)) {
  if (/^block\..+\.prisma$/.test(fileName)) rmSync(join(outDir, fileName));
}

let count = 0;
for (const entry of readdirSync(blocksDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const source = join(blocksDir, entry.name, "schema.prisma");
  if (!existsSync(source)) continue;
  const destination = join(outDir, `block.${entry.name}.prisma`);
  copyFileSync(source, destination);
  writeFileSync(destination, `// GENERATED from blocks/${entry.name}/schema.prisma — edit that file instead.\n\n` + readFileSync(destination, "utf8"));
  count++;
}
console.log(`collect-schema: ${count} block schema file(s) -> prisma/schema/block.*.prisma`);
