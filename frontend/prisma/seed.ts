// Seeds the component library (component types and their implementations).
//
//   npx prisma db seed
//
// Safe to run any number of times: types are upserted by name and implementations by id, so
// re-running updates existing rows to match prisma/seed/componentLibrary.ts and never
// creates duplicates.
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
  const typeKeys = new Set<string>();
  for (const type of types) {
    if (typeKeys.has(type.name)) problems.push(`Duplicate component type name "${type.name}".`);
    typeKeys.add(type.name);
  }

  const implementationIds = new Set<string>();
  const defaultsPerType = new Map<string, number>();
  for (const implementation of implementations) {
    if (implementationIds.has(implementation.id)) {
      problems.push(`Duplicate implementation id "${implementation.id}".`);
    }
    implementationIds.add(implementation.id);
    if (!typeKeys.has(implementation.componentType)) {
      problems.push(`"${implementation.id}" refers to unknown type "${implementation.componentType}".`);
    }
    if (implementation.availability <= 0 || implementation.availability > 1) {
      problems.push(`"${implementation.id}" availability must be in (0, 1].`);
    }
    if (implementation.hitRate !== null && (implementation.hitRate < 0 || implementation.hitRate > 1)) {
      problems.push(`"${implementation.id}" hitRate must be in [0, 1].`);
    }
    if (implementation.isDefault) {
      const count = defaultsPerType.get(implementation.componentType) ?? 0;
      defaultsPerType.set(implementation.componentType, count + 1);
    }
  }

  for (const typeKey of typeKeys) {
    const defaults = defaultsPerType.get(typeKey) ?? 0;
    if (defaults !== 1) {
      problems.push(`Type "${typeKey}" needs exactly one default implementation (found ${defaults}).`);
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
    // One transaction: either the whole library is written or nothing is. Types go first
    // so each implementation can look up its type's numeric id by name.
    await prisma.$transaction(
      async (tx) => {
        const typeIdByKey = new Map<string, number>();
        for (const [sortOrder, type] of COMPONENT_TYPES.entries()) {
          const data = { label: type.label, family: type.family, description: type.description, sortOrder };
          const row = await tx.componentType.upsert({
            where: { name: type.name },
            create: { name: type.name, ...data },
            update: data,
            select: { id: true },
          });
          typeIdByKey.set(type.name, row.id);
        }

        // Position within each type, in seed-file order.
        const positionInType = new Map<string, number>();
        for (const { id, componentType, ...fields } of COMPONENT_IMPLEMENTATIONS) {
          const sortOrder = positionInType.get(componentType) ?? 0;
          positionInType.set(componentType, sortOrder + 1);
          const data = { ...fields, sortOrder, componentTypeId: typeIdByKey.get(componentType) as number };
          await tx.componentImplementation.upsert({ where: { id }, create: { id, ...data }, update: data });
        }
      },
      { timeout: 30_000 },
    );

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
