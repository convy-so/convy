ALTER TABLE "surveys"
  DROP COLUMN IF EXISTS "improvement_feedback";

ALTER TABLE "sample_conversations"
  DROP COLUMN IF EXISTS "feedback",
  DROP COLUMN IF EXISTS "final_comments";
