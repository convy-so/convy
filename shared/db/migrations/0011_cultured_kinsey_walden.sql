ALTER TABLE "expert_frameworks" DROP CONSTRAINT "expert_frameworks_course_id_courses_id_fk";
--> statement-breakpoint
ALTER TABLE "expert_frameworks" DROP CONSTRAINT "expert_frameworks_classroom_id_classrooms_id_fk";
--> statement-breakpoint
ALTER TABLE "expert_frameworks" DROP CONSTRAINT "expert_frameworks_topic_id_learning_topics_id_fk";
--> statement-breakpoint
ALTER TABLE "expert_runtime_models" DROP CONSTRAINT "expert_runtime_models_course_id_courses_id_fk";
--> statement-breakpoint
ALTER TABLE "expert_guidance_packs" ADD CONSTRAINT "expert_guidance_packs_active_version_id_expert_guidance_versions_id_fk" FOREIGN KEY ("active_version_id") REFERENCES "public"."expert_guidance_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD CONSTRAINT "expert_frameworks_active_version_id_expert_framework_versions_id_fk" FOREIGN KEY ("active_version_id") REFERENCES "public"."expert_framework_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD CONSTRAINT "expert_frameworks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD CONSTRAINT "expert_frameworks_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD CONSTRAINT "expert_frameworks_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_runtime_models" ADD CONSTRAINT "expert_runtime_models_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;