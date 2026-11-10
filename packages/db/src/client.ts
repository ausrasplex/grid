// One shared Prisma 7 client. The generated client lands in ./generated
// when you run `pnpm db:generate` (see prisma/schema/base.prisma).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

export type { Prisma } from "./generated/client";
export * from "./generated/enums";

function create(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

// Reuse across Next.js hot reloads in development.
const globalStore = globalThis as unknown as { __prisma?: PrismaClient };
export const db: PrismaClient = globalStore.__prisma ?? create();
if (process.env.NODE_ENV !== "production") globalStore.__prisma = db;

/** The client or an interactive-transaction client; both work in helpers. */
export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
