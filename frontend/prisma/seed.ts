// Seeds the component library (component types and their implementations).
//
//   npx prisma db seed
//
// Safe to run any number of times: rows are upserted by id, so re-running updates
// existing rows to match prisma/seed/componentLibrary.ts and never creates duplicates.
// Rows that are no longer in the seed file are left alone (delete them by hand if needed).
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
// @prisma/client is CommonJS when run directly by Node, so take PrismaClient off the default export.
import prismaClientPackage from "@prisma/client";

import {
  COMPONENT_IMPLEMENTATIONS,
  COMPONENT_TYPES,
  type ComponentImplementationSeed,
  type ComponentTypeSeed,
} from "./seed/componentLibrary.ts";

const { PrismaClient } = prismaClientPackage;

// Catches mistakes in the seed data before anything is written.
function validate(
  types: readonly ComponentTypeSeed[],
  implementations: readonly ComponentImplementationSeed[],
): void {
  const problems: string[] = [];
  const typeIds = new Set<string>();
  for (const type of types) {
    if (typeIds.has(type.id)) problems.push(`Duplicate component type id "${type.id}".`);
    typeIds.add(type.id);
  }

  const implementationIds = new Set<string>();
  const defaultsPerType = new Map<string, number>();
  for (const implementation of implementations) {
    if (implementationIds.has(implementation.id)) {
      problems.push(`Duplicate implementation id "${implementation.id}".`);
    }
    implementationIds.add(implementation.id);
    if (!typeIds.has(implementation.componentTypeId)) {
      problems.push(`"${implementation.id}" refers to unknown type "${implementation.componentTypeId}".`);
    }
    if (implementation.availability <= 0 || implementation.availability > 1) {
      problems.push(`"${implementation.id}" availability must be in (0, 1].`);
    }
    if (implementation.hitRate !== null && (implementation.hitRate < 0 || implementation.hitRate > 1)) {
      problems.push(`"${implementation.id}" hitRate must be in [0, 1].`);
    }
    if (implementation.isDefault) {
      const count = defaultsPerType.get(implementation.componentTypeId) ?? 0;
      defaultsPerType.set(implementation.componentTypeId, count + 1);
    }
  }

  for (const typeId of typeIds) {
    const defaults = defaultsPerType.get(typeId) ?? 0;
    if (defaults !== 1) {
      problems.push(`Type "${typeId}" needs exactly one default implementation (found ${defaults}).`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid component library seed data:\n- ${problems.join("\n- ")}`);
  }
}

async function main(): Promise<void> {
  validate(COMPONENT_TYPES, COMPONENT_IMPLEMENTATIONS);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to seed the database.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    // Position within each type, in seed-file order.
    const positionInType = new Map<string, number>();
    const implementationRows = COMPONENT_IMPLEMENTATIONS.map((implementation) => {
      const sortOrder = positionInType.get(implementation.componentTypeId) ?? 0;
      positionInType.set(implementation.componentTypeId, sortOrder + 1);
      return { ...implementation, sortOrder };
    });

    // One transaction: either the whole library is written or nothing is.
    await prisma.$transaction([
      ...COMPONENT_TYPES.map((type, sortOrder) => {
        const data = { label: type.label, family: type.family, description: type.description, sortOrder };
        return prisma.componentType.upsert({
          where: { id: type.id },
          create: { id: type.id, ...data },
          update: data,
        });
      }),
      ...implementationRows.map(({ id, ...data }) =>
        prisma.componentImplementation.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        }),
      ),
    ]);

    console.log(
      `Seeded ${COMPONENT_TYPES.length} component types and ${COMPONENT_IMPLEMENTATIONS.length} implementations.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
