-- CreateTable
CREATE TABLE "run_users" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_sessions" (
    "token_hash" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_sessions_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "run_items" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "owner_id" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "queued_at" TIMESTAMP(3),
    "queued_by" TEXT,
    "word_count" INTEGER,
    "processed_by" TEXT,
    "processed_at" TIMESTAMP(3),
    "file_name" TEXT,
    "file_type" TEXT,
    "file_data" BYTEA,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "run_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "run_users_project_id_email_key" ON "run_users"("project_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "run_users_project_id_number_key" ON "run_users"("project_id", "number");

-- CreateIndex
CREATE INDEX "run_sessions_project_id_idx" ON "run_sessions"("project_id");

-- CreateIndex
CREATE INDEX "run_items_project_id_owner_id_idx" ON "run_items"("project_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "run_items_project_id_number_key" ON "run_items"("project_id", "number");

-- AddForeignKey
ALTER TABLE "run_users" ADD CONSTRAINT "run_users_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_sessions" ADD CONSTRAINT "run_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_sessions" ADD CONSTRAINT "run_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "run_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_items" ADD CONSTRAINT "run_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_items" ADD CONSTRAINT "run_items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "run_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
