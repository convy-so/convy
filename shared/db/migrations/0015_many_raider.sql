ALTER TABLE "expert_runtime_models" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_model_analyses" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_model_snapshots" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_models" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "expert_runtime_models" CASCADE;--> statement-breakpoint
DROP TABLE "student_model_analyses" CASCADE;--> statement-breakpoint
DROP TABLE "student_model_snapshots" CASCADE;--> statement-breakpoint
DROP TABLE "student_models" CASCADE;--> statement-breakpoint
ALTER TABLE "learning_sessions" ALTER COLUMN "state" SET DEFAULT '{"topicId":null,"topicTitle":"","frameworkVersionId":null,"groundingPackVersion":0,"contentScopeSnapshot":null,"recentMessageSummary":"","recentEvidence":[],"tutorNotes":[],"turnCount":0,"reportReady":false,"completed":false,"completionRequestedAt":null}'::jsonb;