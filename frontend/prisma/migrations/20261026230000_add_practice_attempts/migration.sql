-- CreateTable
CREATE TABLE "practice_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scenario_id" TEXT,
    "project_id" TEXT,
    "graph" JSONB NOT NULL,
    "traffic" JSONB NOT NULL,
    "model_version" INTEGER NOT NULL,
    "answer" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "correct" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_attempts_user_id_kind_created_at_idx" ON "practice_attempts"("user_id", "kind", "created_at");

-- AddForeignKey
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
