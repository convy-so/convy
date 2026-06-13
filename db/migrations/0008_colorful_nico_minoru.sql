CREATE TABLE "courses" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_user_id" text,
	CONSTRAINT "courses_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "expert_eval_cases" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expert_eval_datasets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "expert_eval_cases" CASCADE;--> statement-breakpoint
DROP TABLE "expert_eval_datasets" CASCADE;--> statement-breakpoint
ALTER TABLE "expert_runtime_models" DROP CONSTRAINT "expert_runtime_models_topic_version_unique";--> statement-breakpoint
ALTER TABLE "expert_runtime_models" DROP CONSTRAINT "expert_runtime_models_topic_id_learning_topics_id_fk";
--> statement-breakpoint
ALTER TABLE "expert_runtime_models" ALTER COLUMN "topic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "expert_conflicts" ADD COLUMN "course_id" text;--> statement-breakpoint
ALTER TABLE "expert_crystallizations" ADD COLUMN "course_id" text;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD COLUMN "course_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD COLUMN "subject_key" text DEFAULT 'general_science' NOT NULL;--> statement-breakpoint
ALTER TABLE "expert_review_cases" ADD COLUMN "course_id" text;--> statement-breakpoint
ALTER TABLE "expert_runtime_models" ADD COLUMN "course_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD COLUMN "course_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "courses_key_idx" ON "courses" USING btree ("key");--> statement-breakpoint
CREATE INDEX "courses_status_idx" ON "courses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "courses_created_by_user_id_idx" ON "courses" USING btree ("created_by_user_id");--> statement-breakpoint
ALTER TABLE "expert_conflicts" ADD CONSTRAINT "expert_conflicts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_crystallizations" ADD CONSTRAINT "expert_crystallizations_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD CONSTRAINT "expert_frameworks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_review_cases" ADD CONSTRAINT "expert_review_cases_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_runtime_models" ADD CONSTRAINT "expert_runtime_models_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_runtime_models" ADD CONSTRAINT "expert_runtime_models_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD CONSTRAINT "learning_topics_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expert_conflicts_course_idx" ON "expert_conflicts" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "expert_crystallizations_course_idx" ON "expert_crystallizations" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "expert_frameworks_course_id_idx" ON "expert_frameworks" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "expert_frameworks_subject_key_idx" ON "expert_frameworks" USING btree ("subject_key");--> statement-breakpoint
CREATE INDEX "expert_review_cases_course_idx" ON "expert_review_cases" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "expert_runtime_models_course_idx" ON "expert_runtime_models" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "learning_topics_course_id_idx" ON "learning_topics" USING btree ("course_id");--> statement-breakpoint
ALTER TABLE "expert_runtime_models" ADD CONSTRAINT "expert_runtime_models_course_version_unique" UNIQUE("course_id","version");