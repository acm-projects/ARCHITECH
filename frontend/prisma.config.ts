
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { defineConfig } from "prisma/config";

const envPath = join(dirname(fileURLToPath(import.meta.url)), ".env");
const { DATABASE_URL } = parse(readFileSync(envPath));

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is missing from frontend/.env");
}

// Show the database target without exposing the password.
const target = new URL(DATABASE_URL);
console.log("Prisma database target:", target.hostname, target.port, target.pathname);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --experimental-strip-types prisma/seed.ts",
  },
  datasource: {
    url: DATABASE_URL,
  },
});
