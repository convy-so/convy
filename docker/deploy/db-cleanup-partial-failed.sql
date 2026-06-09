-- Run once on production if a previous partial migration failed before the full baseline.
-- Supabase SQL editor or: psql $DATABASE_URL -f docker/deploy/db-cleanup-partial-failed.sql
--
-- Only needed when switching from the old 0016 delta migration to 0000_initial_schema.

DROP TABLE IF EXISTS "topic_material_upload_attempts" CASCADE;
DROP TABLE IF EXISTS "expert_invitations" CASCADE;
DROP TABLE IF EXISTS "courses" CASCADE;
DROP TYPE IF EXISTS "expert_invitation_status" CASCADE;

DELETE FROM public."__drizzle_migrations";
