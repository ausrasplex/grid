// Prisma 7 config. The schema is a FOLDER: base files live in
// prisma/schema/, and each block's schema.prisma is copied into
// prisma/schema/ by scripts/collect-schema.mjs before generate.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
