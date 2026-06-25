DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT lower(email) AS normalized_email
      FROM users
      GROUP BY lower(email)
      HAVING count(*) > 1
    ) duplicated_users
  ) THEN
    RAISE EXCEPTION 'Cannot normalize users.email because duplicates exist after lowercasing.';
  END IF;
END $$;
--> statement-breakpoint
UPDATE "users" SET "email" = lower(trim("email"));
--> statement-breakpoint
UPDATE "classroom_invitations" SET "invited_email" = lower(trim("invited_email"));
--> statement-breakpoint
UPDATE "classroom_students" SET "email" = lower(trim("email"));
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_check" CHECK (lower("email") = "email");
--> statement-breakpoint
ALTER TABLE "classroom_invitations" ADD CONSTRAINT "classroom_invitations_email_lowercase_check" CHECK (lower("invited_email") = "invited_email");
--> statement-breakpoint
ALTER TABLE "classroom_students" ADD CONSTRAINT "classroom_students_email_lowercase_check" CHECK (lower("email") = "email");
--> statement-breakpoint
CREATE UNIQUE INDEX "classroom_students_classroom_user_unique" ON "classroom_students" USING btree ("classroom_id","user_id") WHERE "classroom_students"."user_id" is not null;
