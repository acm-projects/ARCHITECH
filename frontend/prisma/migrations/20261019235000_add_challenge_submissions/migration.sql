-- CreateTable
CREATE TABLE "challenge_submissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "project_id" TEXT,
    "graph" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "requirement_score" INTEGER NOT NULL,
    "architecture_score" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "challenge_submissions_challenge_id_score_idx" ON "challenge_submissions"("challenge_id", "score");

-- CreateIndex
CREATE INDEX "challenge_submissions_user_id_created_at_idx" ON "challenge_submissions"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
