
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { defineConfig } from "prisma/config";

const envPath = join(dirname(fileURLToPath(import.meta.url)), ".env");
const DATABASE_URL = process.env.DATABASE_URL ?? (existsSync(envPath) ? parse(readFileSync(envPath)).DATABASE_URL : undefined);

// Show the database target without exposing the password.
if (DATABASE_URL) {
  const target = new URL(DATABASE_URL);
  console.log("Prisma database target:", target.hostname, target.port, target.pathname);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --experimental-strip-types prisma/seed.ts",
  },
  ...(DATABASE_URL ? { datasource: { url: DATABASE_URL } } : {}),
});
