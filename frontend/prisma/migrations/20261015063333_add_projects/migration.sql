/*
  Warnings:

  - The primary key for the `component_types` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `component_types` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[key]` on the table `component_types` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `component_type_id` on the `component_implementations` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `key` to the `component_types` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "component_implementations" DROP CONSTRAINT "component_implementations_component_type_id_fkey";

-- AlterTable
ALTER TABLE "component_implementations" DROP COLUMN "component_type_id",
ADD COLUMN     "component_type_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "component_types" DROP CONSTRAINT "component_types_pkey",
ADD COLUMN     "key" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "component_types_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "learn_skipped" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "graph" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_opened_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");

-- CreateIndex
CREATE INDEX "component_implementations_component_type_id_idx" ON "component_implementations"("component_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "component_types_key_key" ON "component_types"("key");

-- AddForeignKey
ALTER TABLE "component_implementations" ADD CONSTRAINT "component_implementations_component_type_id_fkey" FOREIGN KEY ("component_type_id") REFERENCES "component_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
