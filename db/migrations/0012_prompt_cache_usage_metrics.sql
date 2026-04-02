ALTER TABLE "usage_logs"
ADD COLUMN IF NOT EXISTS "input_no_cache_tokens" integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS "cache_read_tokens" integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS "cache_write_tokens" integer DEFAULT 0;
