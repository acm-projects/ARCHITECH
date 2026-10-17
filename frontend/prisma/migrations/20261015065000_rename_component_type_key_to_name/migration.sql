-- Rename component_types.key to name (keeps existing rows).
ALTER TABLE "component_types" RENAME COLUMN "key" TO "name";

-- Keep the unique index name Prisma expects for the renamed column.
ALTER INDEX "component_types_key_key" RENAME TO "component_types_name_key";
