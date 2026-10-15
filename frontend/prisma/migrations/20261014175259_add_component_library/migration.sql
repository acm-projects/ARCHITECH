-- CreateEnum
CREATE TYPE "component_family" AS ENUM ('general', 'frontend', 'backend', 'data', 'infrastructure');

-- CreateTable
CREATE TABLE "component_types" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "family" "component_family" NOT NULL,
    "description" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "component_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_implementations" (
    "id" TEXT NOT NULL,
    "component_type_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT,
    "description" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "capacity_per_instance" INTEGER,
    "connections_per_instance" INTEGER,
    "latency_ms" DOUBLE PRECISION NOT NULL,
    "monthly_cost_per_instance" DOUBLE PRECISION NOT NULL,
    "availability" DOUBLE PRECISION NOT NULL,
    "hit_rate" DOUBLE PRECISION,
    "strengths" TEXT[],
    "tradeoffs" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "component_implementations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "component_implementations_component_type_id_idx" ON "component_implementations"("component_type_id");

-- AddForeignKey
ALTER TABLE "component_implementations" ADD CONSTRAINT "component_implementations_component_type_id_fkey" FOREIGN KEY ("component_type_id") REFERENCES "component_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
