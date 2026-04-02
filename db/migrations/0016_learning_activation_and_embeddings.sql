BEGIN;

ALTER TABLE "topic_materials" ADD COLUMN IF NOT EXISTS "analysis" jsonb DEFAULT '{}'::jsonb;

ALTER TABLE "learning_sessions" ALTER COLUMN "topic_id" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "student_access_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "classroom_student_id" text NOT NULL REFERENCES "classroom_students"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "purpose" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "student_access_tokens_student_id_idx" ON "student_access_tokens" ("classroom_student_id");
CREATE INDEX IF NOT EXISTS "student_access_tokens_user_id_idx" ON "student_access_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "student_access_tokens_token_hash_idx" ON "student_access_tokens" ("token_hash");

CREATE TABLE IF NOT EXISTS "learning_material_embeddings" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "topic_id" text NOT NULL REFERENCES "learning_topics"("id") ON DELETE cascade,
  "material_id" text NOT NULL REFERENCES "topic_materials"("id") ON DELETE cascade,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "embedding" vector(1536)
);
CREATE INDEX IF NOT EXISTS "learning_material_embeddings_topic_id_idx" ON "learning_material_embeddings" ("topic_id");
CREATE INDEX IF NOT EXISTS "learning_material_embeddings_material_id_idx" ON "learning_material_embeddings" ("material_id");
CREATE INDEX IF NOT EXISTS "learning_material_embeddings_embedding_idx" ON "learning_material_embeddings" USING hnsw ("embedding" vector_cosine_ops);

COMMIT;
