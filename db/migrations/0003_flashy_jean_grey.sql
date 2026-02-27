CREATE TYPE "public"."creation_conversation_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."tone" AS ENUM('formal', 'casual', 'playful', 'empathetic');--> statement-breakpoint
CREATE TYPE "public"."voice_chunk_type" AS ENUM('audio_in', 'audio_out');--> statement-breakpoint
CREATE TYPE "public"."voice_session_status" AS ENUM('active', 'completed', 'abandoned', 'error');--> statement-breakpoint
CREATE TYPE "public"."voice_session_type" AS ENUM('survey_creation', 'survey_response', 'sample_conversation');--> statement-breakpoint
ALTER TYPE "public"."language" ADD VALUE 'es';--> statement-breakpoint
ALTER TYPE "public"."language" ADD VALUE 'it';--> statement-breakpoint
ALTER TYPE "public"."survey_status" ADD VALUE 'creating' BEFORE 'sample_review';--> statement-breakpoint
ALTER TYPE "public"."survey_status" ADD VALUE 'paused' BEFORE 'completed';--> statement-breakpoint
CREATE TABLE "user_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"verification_token" text,
	CONSTRAINT "user_emails_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "usage_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"organization_id" text,
	"project_id" text,
	"survey_id" text,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"model_name" text,
	"prompt_tokens" integer DEFAULT 0,
	"completion_tokens" integer DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"duration_ms" integer DEFAULT 0,
	"cost" numeric DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_creation_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"operation" text NOT NULL,
	"response_body" jsonb,
	"response_status" text,
	"locked_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"inviter_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"user_id" text NOT NULL,
	"organization_id" text,
	"color" text,
	"icon" text
);
--> statement-breakpoint
CREATE TABLE "document_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"embedding" vector(1536)
);
--> statement-breakpoint
CREATE TABLE "knowledge_base" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"domain_id" integer,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"quality_score" integer DEFAULT 0,
	"usage_count" integer DEFAULT 0,
	"source" text DEFAULT 'system',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'CANDIDATE' NOT NULL,
	"performance_score" real,
	"effective_phase" text,
	"effective_style" text,
	"effective_obstacle" text,
	"promoted_at" timestamp with time zone,
	"experiment_wins" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"chunk_type" "voice_chunk_type" NOT NULL,
	"duration_ms" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"transcription" text,
	"synthesis_text" text,
	"cost" numeric DEFAULT '0',
	"had_speech" boolean DEFAULT true,
	"vad_probability" text,
	"processing_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_quality_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"metric_type" text NOT NULL,
	"metric_value" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"survey_id" text,
	"conversation_id" text,
	"session_type" "voice_session_type" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_ms" integer DEFAULT 0,
	"audio_duration_ms" integer DEFAULT 0,
	"total_cost" numeric DEFAULT '0',
	"stt_cost" numeric DEFAULT '0',
	"tts_cost" numeric DEFAULT '0',
	"status" "voice_session_status" DEFAULT 'active',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'info',
	"link" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_creation_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_ms" integer DEFAULT 0,
	"active_duration_ms" integer DEFAULT 0,
	"status" "creation_conversation_status" DEFAULT 'in_progress' NOT NULL,
	"collected_info" jsonb DEFAULT '{}'::jsonb,
	"extracted_data" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "survey_creation_conversations_survey_id_unique" UNIQUE("survey_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_moves" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" text NOT NULL,
	"survey_id" text NOT NULL,
	"turn_index" integer NOT NULL,
	"ai_question" text NOT NULL,
	"participant_response" text NOT NULL,
	"technique_id" text,
	"technique_category" text,
	"phase" text,
	"response_word_count" integer DEFAULT 0 NOT NULL,
	"response_richness_score" real DEFAULT 0 NOT NULL,
	"led_to_abandonment" boolean DEFAULT false NOT NULL,
	"participant_style_at_turn" text,
	"topics_discussed_so_far" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "conversation_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" text NOT NULL,
	"survey_id" text NOT NULL,
	"completion_rate" real DEFAULT 0 NOT NULL,
	"dropoff_turn_index" integer,
	"total_turns" integer DEFAULT 0 NOT NULL,
	"avg_words_per_response" real DEFAULT 0 NOT NULL,
	"one_word_response_count" integer DEFAULT 0 NOT NULL,
	"offtopic_response_count" integer DEFAULT 0 NOT NULL,
	"objective_coverage_score" real DEFAULT 0 NOT NULL,
	"missed_objectives" jsonb DEFAULT '[]'::jsonb,
	"detected_style" text,
	"style_detection_confidence" real,
	"avg_response_richness_score" real DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "experiment_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"experiment_id" text NOT NULL,
	"move_id" text NOT NULL,
	"assigned_variant" text NOT NULL,
	"response_word_count" integer DEFAULT 0 NOT NULL,
	"response_richness_score" real DEFAULT 0 NOT NULL,
	"led_to_abandonment" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"effective_phase" text,
	"effective_style" text,
	"effective_obstacle" text,
	"control_pattern_id" text,
	"variant_pattern_id" text,
	"traffic_split" real DEFAULT 0.5 NOT NULL,
	"min_sample_size" integer DEFAULT 30 NOT NULL,
	"concluded_at" timestamp with time zone,
	"winner_id" text
);
--> statement-breakpoint
CREATE TABLE "participant_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" text NOT NULL,
	"survey_id" text NOT NULL,
	"rating" integer,
	"felt_natural" boolean,
	"uncomfortable_topics" boolean DEFAULT false NOT NULL,
	"free_text" text
);
--> statement-breakpoint
ALTER TABLE "survey_analytics" ALTER COLUMN "last_updated" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ALTER COLUMN "required_questions" SET DATA TYPE text[];--> statement-breakpoint
ALTER TABLE "surveys" ALTER COLUMN "required_questions" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "surveys" ALTER COLUMN "required_questions" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ALTER COLUMN "metrics" SET DATA TYPE text[];--> statement-breakpoint
ALTER TABLE "surveys" ALTER COLUMN "metrics" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "surveys" ALTER COLUMN "status" SET DEFAULT 'creating';--> statement-breakpoint
ALTER TABLE "sample_conversations" ADD COLUMN "duration_ms" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "sample_conversations" ADD COLUMN "active_duration_ms" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "sample_conversations" ADD COLUMN "insights" jsonb;--> statement-breakpoint
ALTER TABLE "sample_conversations" ADD COLUMN "final_comments" text;--> statement-breakpoint
ALTER TABLE "sample_conversations" ADD COLUMN "comments" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "active_organization_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "active_team_id" text;--> statement-breakpoint
ALTER TABLE "survey_analytics" ADD COLUMN "generated_language" text DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "survey_conversations" ADD COLUMN "duration_ms" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "survey_conversations" ADD COLUMN "active_duration_ms" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "survey_conversations" ADD COLUMN "original_language" text DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "survey_conversations" ADD COLUMN "translated_conversation" jsonb;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "core_objective" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "expert_state" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "tone" "tone" DEFAULT 'casual';--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "media" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "personal_info" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "custom_slug" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "domain_id" integer;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "is_voice" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "improvement_feedback" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "collaborators" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_language" text DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "user_emails" ADD CONSTRAINT "user_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_creation_comments" ADD CONSTRAINT "survey_creation_comments_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_creation_comments" ADD CONSTRAINT "survey_creation_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_chunks" ADD CONSTRAINT "voice_chunks_session_id_voice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_quality_metrics" ADD CONSTRAINT "voice_quality_metrics_session_id_voice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_creation_conversations" ADD CONSTRAINT "survey_creation_conversations_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_moves" ADD CONSTRAINT "conversation_moves_conversation_id_survey_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."survey_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_signals" ADD CONSTRAINT "conversation_signals_conversation_id_survey_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."survey_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_outcomes" ADD CONSTRAINT "experiment_outcomes_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_outcomes" ADD CONSTRAINT "experiment_outcomes_move_id_conversation_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."conversation_moves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_control_pattern_id_knowledge_base_id_fk" FOREIGN KEY ("control_pattern_id") REFERENCES "public"."knowledge_base"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_variant_pattern_id_knowledge_base_id_fk" FOREIGN KEY ("variant_pattern_id") REFERENCES "public"."knowledge_base"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_feedback" ADD CONSTRAINT "participant_feedback_conversation_id_survey_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."survey_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_emails_user_id_idx" ON "user_emails" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_logs_user_id_idx" ON "usage_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_logs_organization_id_idx" ON "usage_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "usage_logs_survey_id_idx" ON "usage_logs" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "usage_logs_created_at_idx" ON "usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "usage_logs_type_idx" ON "usage_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "survey_creation_comments_survey_id_idx" ON "survey_creation_comments" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_creation_comments_user_id_idx" ON "survey_creation_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_organization_id_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "projects_created_by_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "document_embeddings_survey_id_idx" ON "document_embeddings" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "document_embeddings_source_idx" ON "document_embeddings" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "document_embeddings_embedding_idx" ON "document_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "knowledge_base_domain_idx" ON "knowledge_base" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "knowledge_base_category_idx" ON "knowledge_base" USING btree ("category");--> statement-breakpoint
CREATE INDEX "knowledge_base_status_idx" ON "knowledge_base" USING btree ("status");--> statement-breakpoint
CREATE INDEX "knowledge_base_situation_idx" ON "knowledge_base" USING btree ("effective_phase","effective_style","effective_obstacle");--> statement-breakpoint
CREATE INDEX "knowledge_base_embedding_idx" ON "knowledge_base" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "voice_chunks_session_id_idx" ON "voice_chunks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "voice_quality_metrics_session_id_idx" ON "voice_quality_metrics" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "voice_sessions_user_id_idx" ON "voice_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "voice_sessions_survey_id_idx" ON "voice_sessions" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "voice_sessions_started_at_idx" ON "voice_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "survey_creation_conversations_survey_id_idx" ON "survey_creation_conversations" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_creation_conversations_status_idx" ON "survey_creation_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conversation_moves_conversation_id_idx" ON "conversation_moves" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_moves_survey_id_idx" ON "conversation_moves" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "conversation_moves_technique_id_idx" ON "conversation_moves" USING btree ("technique_id");--> statement-breakpoint
CREATE INDEX "conversation_signals_conversation_id_idx" ON "conversation_signals" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_signals_survey_id_idx" ON "conversation_signals" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "experiment_outcomes_experiment_id_idx" ON "experiment_outcomes" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "experiment_outcomes_move_id_idx" ON "experiment_outcomes" USING btree ("move_id");--> statement-breakpoint
CREATE INDEX "experiments_status_idx" ON "experiments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "experiments_situation_idx" ON "experiments" USING btree ("effective_phase","effective_style","effective_obstacle");--> statement-breakpoint
CREATE INDEX "participant_feedback_conversation_id_idx" ON "participant_feedback" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "participant_feedback_survey_id_idx" ON "participant_feedback" USING btree ("survey_id");--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "surveys_organization_id_idx" ON "surveys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "surveys_custom_slug_idx" ON "surveys" USING btree ("custom_slug");--> statement-breakpoint
ALTER TABLE "surveys" DROP COLUMN "goal";--> statement-breakpoint
ALTER TABLE "surveys" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "surveys" DROP COLUMN "information";--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_custom_slug_unique" UNIQUE("custom_slug");