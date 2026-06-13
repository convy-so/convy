ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "classroom_students_classroom_user_unique" ON "classroom_students" USING btree ("classroom_id","user_id") WHERE "classroom_students"."user_id" is not null;--> statement-breakpoint
ALTER TABLE "learning_topics" DROP COLUMN "subject_label";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_check" CHECK (lower("users"."email") = "users"."email");--> statement-breakpoint
ALTER TABLE "classroom_invitations" ADD CONSTRAINT "classroom_invitations_email_lowercase_check" CHECK (lower("classroom_invitations"."invited_email") = "classroom_invitations"."invited_email");--> statement-breakpoint
ALTER TABLE "classroom_students" ADD CONSTRAINT "classroom_students_email_lowercase_check" CHECK (lower("classroom_students"."email") = "classroom_students"."email");