BEGIN;

ALTER TABLE "surveys" DROP COLUMN IF EXISTS "expert_state";
ALTER TABLE "surveys" DROP COLUMN IF EXISTS "domain_id";
ALTER TABLE "surveys" DROP COLUMN IF EXISTS "hybrid_domains";

ALTER TABLE "sample_conversations" DROP COLUMN IF EXISTS "expert_state";
ALTER TABLE "survey_conversations" DROP COLUMN IF EXISTS "expert_state";

DROP TABLE IF EXISTS "conversation_insights" CASCADE;
DROP TABLE IF EXISTS "survey_analytics" CASCADE;
DROP TABLE IF EXISTS "domain_embeddings" CASCADE;

COMMIT;
