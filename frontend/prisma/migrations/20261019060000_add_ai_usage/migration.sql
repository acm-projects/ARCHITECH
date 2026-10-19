-- CreateTable
CREATE TABLE "ai_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_reply_cache" (
    "key" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_reply_cache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ai_requests_user_id_created_at_idx" ON "ai_requests"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
