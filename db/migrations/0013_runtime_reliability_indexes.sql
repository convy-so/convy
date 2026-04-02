CREATE INDEX IF NOT EXISTS "notifications_user_created_idx"
ON "notifications" ("user_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notifications_user_read_created_idx"
ON "notifications" ("user_id", "read", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "workspace_outbox_unpublished_created_idx"
ON "workspace_outbox" ("published_at", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_embeddings_fts_en_idx"
ON "document_embeddings"
USING gin (to_tsvector('english', "content"))
WHERE "metadata"->>'language' = 'en';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_embeddings_fts_fr_idx"
ON "document_embeddings"
USING gin (to_tsvector('french', "content"))
WHERE "metadata"->>'language' = 'fr';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_embeddings_fts_de_idx"
ON "document_embeddings"
USING gin (to_tsvector('german', "content"))
WHERE "metadata"->>'language' = 'de';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_embeddings_fts_es_idx"
ON "document_embeddings"
USING gin (to_tsvector('spanish', "content"))
WHERE "metadata"->>'language' = 'es';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_embeddings_fts_it_idx"
ON "document_embeddings"
USING gin (to_tsvector('italian', "content"))
WHERE "metadata"->>'language' = 'it';
