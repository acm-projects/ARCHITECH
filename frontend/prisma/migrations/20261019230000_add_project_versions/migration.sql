-- CreateTable
CREATE TABLE "project_versions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "graph" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_versions_project_id_created_at_idx" ON "project_versions"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
