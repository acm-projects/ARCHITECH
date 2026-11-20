-- CreateTable
CREATE TABLE "auth_attempts" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_attempts_kind_key_hash_created_at_idx" ON "auth_attempts"("kind", "key_hash", "created_at");

-- CreateIndex
CREATE INDEX "auth_attempts_created_at_idx" ON "auth_attempts"("created_at");
