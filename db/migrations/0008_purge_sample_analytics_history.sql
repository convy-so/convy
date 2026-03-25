-- Rehearsal/sample sessions are not real respondent data and must not feed
-- analytics snapshots, analytics retrieval, or session-level analytics views.
--
-- This cleanup removes historical sample-derived analytics artifacts and
-- invalidates previously generated analytics snapshots so they are rebuilt
-- from live-only data.

DELETE FROM "survey_session_insights" AS "ssi"
USING "survey_sessions" AS "ss"
WHERE "ssi"."session_id" = "ss"."id"
  AND "ss"."session_type" = 'sample';

DELETE FROM "survey_analytics_facts" AS "saf"
USING "survey_sessions" AS "ss"
WHERE "saf"."session_id" = "ss"."id"
  AND "ss"."session_type" = 'sample';

DELETE FROM "document_embeddings"
WHERE "source_type" = 'analytics';

DELETE FROM "document_embeddings" AS "de"
USING "survey_sessions" AS "ss"
WHERE "de"."source_type" = 'insight'
  AND "de"."source_id" = "ss"."id"
  AND "ss"."session_type" = 'sample';

DELETE FROM "document_embeddings" AS "de"
USING "survey_evidence" AS "se", "survey_sessions" AS "ss"
WHERE "de"."source_type" = 'response'
  AND "de"."source_id" = "se"."id"
  AND "se"."session_id" = "ss"."id"
  AND "ss"."session_type" = 'sample';

DELETE FROM "document_embeddings"
WHERE "metadata"->>'sessionType' = 'sample';

DELETE FROM "survey_analytics_snapshots";
DELETE FROM "survey_analytics_states";
