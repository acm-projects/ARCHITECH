-- CreateIndex
CREATE INDEX "ai_requests_created_at_idx" ON "ai_requests"("created_at");

-- CreateIndex
CREATE INDEX "ai_reply_cache_created_at_idx" ON "ai_reply_cache"("created_at");
