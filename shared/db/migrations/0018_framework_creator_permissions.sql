ALTER TABLE "expert_frameworks"
ADD COLUMN IF NOT EXISTS "created_by_user_id" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expert_frameworks_created_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "expert_frameworks"
    ADD CONSTRAINT "expert_frameworks_created_by_user_id_users_id_fk"
    FOREIGN KEY ("created_by_user_id")
    REFERENCES "public"."users"("id")
    ON DELETE set null
    ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
UPDATE "expert_frameworks" AS framework
SET "created_by_user_id" = COALESCE(
  framework."activated_by_user_id",
  course."created_by_user_id"
)
FROM "courses" AS course
WHERE framework."course_id" = course."id"
  AND framework."created_by_user_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expert_frameworks_created_by_user_id_idx"
ON "expert_frameworks" USING btree ("created_by_user_id");
--> statement-breakpoint
ALTER TABLE "expert_frameworks"
DROP COLUMN IF EXISTS "activated_by_user_id";
