CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."expert_invitation_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."creation_conversation_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'fr', 'de', 'es', 'it');--> statement-breakpoint
CREATE TYPE "public"."survey_status" AS ENUM('draft', 'creating', 'sample_review', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."tone" AS ENUM('formal', 'casual', 'playful', 'empathetic');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'teacher', 'expert', 'admin');--> statement-breakpoint
CREATE TYPE "public"."voice_chunk_type" AS ENUM('audio_in', 'audio_out');--> statement-breakpoint
CREATE TYPE "public"."voice_session_status" AS ENUM('active', 'completed', 'abandoned', 'error');--> statement-breakpoint
CREATE TYPE "public"."voice_session_type" AS ENUM('survey_creation', 'survey_response', 'sample_conversation');--> statement-breakpoint
CREATE TABLE "expert_guidance_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"feature" text NOT NULL,
	"artifact_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_scope" text DEFAULT 'global' NOT NULL,
	"created_by_user_id" text,
	"active_version_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "expert_guidance_packs_status_check" CHECK ("expert_guidance_packs"."status" in ('draft', 'approved', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "expert_guidance_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pack_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"artifact" jsonb NOT NULL,
	"notes" text,
	"created_by_user_id" text,
	CONSTRAINT "expert_guidance_versions_pack_version_unique" UNIQUE("pack_id","version"),
	CONSTRAINT "expert_guidance_versions_status_check" CHECK ("expert_guidance_versions"."status" in ('draft', 'approved', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "few_shot_examples" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"feature" text NOT NULL,
	"tags" text[] DEFAULT '{}',
	"retrieval_content" text DEFAULT '' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"owned_by_role" text DEFAULT 'expert' NOT NULL,
	"created_by_user_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"embedding" vector(1024)
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"scope" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"password" text,
	CONSTRAINT "accounts_provider_account_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "expert_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_user_id" text NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"invited_email" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"status" "expert_invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "expert_invitations_email_lowercase_check" CHECK (lower("expert_invitations"."invited_email") = "expert_invitations"."invited_email")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"role" "user_role" NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"ui_locale" text DEFAULT 'en',
	"preferred_language" text DEFAULT 'en',
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase_check" CHECK (lower("users"."email") = "users"."email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"project_id" text,
	"survey_id" text,
	"feature" text,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"model_name" text,
	"prompt_tokens" integer DEFAULT 0,
	"completion_tokens" integer DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"input_no_cache_tokens" integer DEFAULT 0,
	"cache_read_tokens" integer DEFAULT 0,
	"cache_write_tokens" integer DEFAULT 0,
	"duration_ms" integer DEFAULT 0,
	"cost" numeric DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_edit_leases" (
	"survey_id" text NOT NULL,
	"stage" text NOT NULL,
	"holder_user_id" text NOT NULL,
	"holder_session_id" text,
	"lease_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "survey_edit_leases_survey_id_stage_pk" PRIMARY KEY("survey_id","stage")
);
--> statement-breakpoint
CREATE TABLE "survey_revisions" (
	"survey_id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"classroom_student_id" text,
	"submitter_role" text NOT NULL,
	"kind" text NOT NULL,
	"source_area" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"contact_email" text,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"user_id" text NOT NULL,
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
	"language" text DEFAULT 'en',
	"session_type" text,
	"document_title" text,
	"embedding_model" text,
	"embedding_version" text,
	"chunking_version" text,
	"content_hash" text,
	"source_updated_at" timestamp with time zone,
	"token_count" integer,
	"raw_content" text DEFAULT '' NOT NULL,
	"retrieval_content" text DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"embedding" vector(1024)
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
CREATE TABLE "analytics_chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'New Chat' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_processed_response_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"rating" integer,
	"felt_natural" boolean,
	"uncomfortable_topics" boolean DEFAULT false NOT NULL,
	"free_text" text
);
--> statement-breakpoint
CREATE TABLE "refinement_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"thread_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"message" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refinement_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"thread_id" text NOT NULL,
	"survey_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"original_request" text NOT NULL,
	"interpretation" text NOT NULL,
	"runtime_effect" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"proposal" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refinement_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"sample_conversation_id" text,
	"created_by" text NOT NULL,
	"summary" text,
	CONSTRAINT "refinement_threads_survey_id_unique" UNIQUE("survey_id")
);
--> statement-breakpoint
CREATE TABLE "research_brief_patches" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"proposal_id" text,
	"patch" jsonb NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sample_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"conversation_number" integer NOT NULL,
	"messages" jsonb NOT NULL,
	"duration_ms" integer DEFAULT 0,
	"active_duration_ms" integer DEFAULT 0,
	"confirmed" boolean DEFAULT false NOT NULL,
	"insights" jsonb,
	"comments" jsonb DEFAULT '[]'::jsonb,
	CONSTRAINT "sample_conversations_survey_number_unique" UNIQUE("survey_id","conversation_number")
);
--> statement-breakpoint
CREATE TABLE "sample_feedback_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"sample_conversation_id" text,
	"conversation_number" integer NOT NULL,
	"created_by" text NOT NULL,
	"feedback_input" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sample_feedback_patches" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"feedback_entry_id" text NOT NULL,
	"conversation_number" integer NOT NULL,
	"status" text NOT NULL,
	"patch" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_analytics_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"session_id" text NOT NULL,
	"node_id" text NOT NULL,
	"fact" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_analytics_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"snapshot" jsonb NOT NULL,
	"is_latest" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_analytics_states" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"state" jsonb NOT NULL,
	CONSTRAINT "survey_analytics_states_survey_id_unique" UNIQUE("survey_id")
);
--> statement-breakpoint
CREATE TABLE "survey_briefs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"program_id" text NOT NULL,
	"brief" jsonb NOT NULL,
	"completeness_status" text DEFAULT 'draft' NOT NULL,
	"approval_state" text DEFAULT 'pending' NOT NULL,
	"missing_fields" text[] DEFAULT '{}' NOT NULL,
	"validation_notes" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "survey_briefs_survey_id_unique" UNIQUE("survey_id")
);
--> statement-breakpoint
CREATE TABLE "survey_conducting_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"mode" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source_patch_id" text,
	"profile" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"participant_id" text,
	"raw_conversation" jsonb NOT NULL,
	"duration_ms" integer DEFAULT 0,
	"active_duration_ms" integer DEFAULT 0,
	"summary" text,
	"completed" boolean DEFAULT false NOT NULL,
	"original_language" text DEFAULT 'en',
	"translated_conversation" jsonb
);
--> statement-breakpoint
CREATE TABLE "survey_coverage_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"plan" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
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
CREATE TABLE "survey_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"session_id" text NOT NULL,
	"turn_id" text,
	"node_id" text NOT NULL,
	"evidence_type" text NOT NULL,
	"excerpt" text NOT NULL,
	"sentiment" text,
	"reliability" integer DEFAULT 70 NOT NULL,
	"metadata" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_session_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"session_id" text NOT NULL,
	"insight" jsonb NOT NULL,
	CONSTRAINT "survey_session_insights_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "survey_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"session_type" text NOT NULL,
	"session_status" text DEFAULT 'active' NOT NULL,
	"source_conversation_id" text,
	"language" text DEFAULT 'en' NOT NULL,
	"respondent_id" text,
	"respondent_role" text,
	"session_state" jsonb NOT NULL,
	"summary" text,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "survey_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"session_id" text NOT NULL,
	"turn_index" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"source_message_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "survey_turns_session_turn_unique" UNIQUE("session_id","turn_index")
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"classroom_id" text,
	"project_id" text,
	"delivery_mode" text DEFAULT 'link' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"core_objective" text,
	"tone" "tone" DEFAULT 'casual',
	"required_questions" text[] DEFAULT '{}',
	"metrics" text[] DEFAULT '{}',
	"media" jsonb DEFAULT '[]'::jsonb,
	"personal_info" text[] DEFAULT '{}',
	"status" "survey_status" DEFAULT 'creating' NOT NULL,
	"shareable_link" text,
	"custom_slug" text,
	"participant_limit" integer DEFAULT 50 NOT NULL,
	"current_participants" integer DEFAULT 0 NOT NULL,
	"sample_conversation_count" integer DEFAULT 0 NOT NULL,
	"program_id" text,
	"confirmed" boolean DEFAULT false NOT NULL,
	"language" "language" DEFAULT 'en' NOT NULL,
	"is_voice" boolean DEFAULT false NOT NULL,
	CONSTRAINT "surveys_shareable_link_unique" UNIQUE("shareable_link"),
	CONSTRAINT "surveys_custom_slug_unique" UNIQUE("custom_slug")
);
--> statement-breakpoint
CREATE TABLE "classroom_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classroom_id" text NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"invited_email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"accepted_by_user_id" text,
	"responded_at" timestamp with time zone,
	CONSTRAINT "classroom_invitations_email_lowercase_check" CHECK (lower("classroom_invitations"."invited_email") = "classroom_invitations"."invited_email")
);
--> statement-breakpoint
CREATE TABLE "classroom_students" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classroom_id" text NOT NULL,
	"user_id" text,
	"invited_by_user_id" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"invite_status" text DEFAULT 'pending' NOT NULL,
	"onboarding_status" text DEFAULT 'interest_profile_pending' NOT NULL,
	CONSTRAINT "classroom_students_classroom_email_unique" UNIQUE("classroom_id","email"),
	CONSTRAINT "classroom_students_email_lowercase_check" CHECK (lower("classroom_students"."email") = "classroom_students"."email")
);
--> statement-breakpoint
CREATE TABLE "classrooms" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"teacher_user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"subject" text,
	"default_content_locale" text DEFAULT 'en' NOT NULL,
	"grade_band" text NOT NULL,
	"grade_label" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "expert_conflicts" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" text,
	"topic_id" text,
	"framework_version_id" text,
	"crystallization_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"summary" text NOT NULL,
	"details" text,
	"resolution_notes" text,
	"resolved_by_user_id" text,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "expert_conflicts_status_check" CHECK ("expert_conflicts"."status" in ('open', 'resolved', 'ignored'))
);
--> statement-breakpoint
CREATE TABLE "expert_crystallizations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" text,
	"topic_id" text,
	"framework_version_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"relevance_scope" text DEFAULT 'general' NOT NULL,
	"title" text NOT NULL,
	"heuristic" jsonb NOT NULL,
	"source_review_case_ids" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"approved_by_user_id" text,
	"approved_at" timestamp with time zone,
	CONSTRAINT "expert_crystallizations_status_check" CHECK ("expert_crystallizations"."status" in ('draft', 'approved', 'archived')),
	CONSTRAINT "expert_crystallizations_relevance_scope_check" CHECK ("expert_crystallizations"."relevance_scope" in ('general', 'framework_specific'))
);
--> statement-breakpoint
CREATE TABLE "expert_framework_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"framework_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"seed_source" text DEFAULT 'deep_default' NOT NULL,
	"framework" jsonb NOT NULL,
	"notes" text,
	"published_at" timestamp with time zone,
	"published_by_user_id" text,
	CONSTRAINT "expert_framework_versions_framework_version_unique" UNIQUE("framework_id","version"),
	CONSTRAINT "expert_framework_versions_status_check" CHECK ("expert_framework_versions"."status" in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "expert_frameworks" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" text NOT NULL,
	"subject_key" text DEFAULT 'general' NOT NULL,
	"classroom_id" text,
	"topic_id" text,
	"name" text NOT NULL,
	"description" text,
	"active_version_id" text,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "expert_review_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" text,
	"topic_id" text,
	"classroom_student_id" text,
	"session_id" text,
	"interaction_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"review_type" text NOT NULL,
	"tutor_failure_summary" text NOT NULL,
	"expert_correction" text NOT NULL,
	"relevance_scope" text DEFAULT 'general' NOT NULL,
	"framework_version_id" text,
	"reusable_signal" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by_user_id" text,
	CONSTRAINT "expert_review_cases_status_check" CHECK ("expert_review_cases"."status" in ('open', 'crystallized', 'dismissed')),
	CONSTRAINT "expert_review_cases_relevance_scope_check" CHECK ("expert_review_cases"."relevance_scope" in ('general', 'framework_specific'))
);
--> statement-breakpoint
CREATE TABLE "learning_evidence_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"topic_id" text,
	"classroom_id" text,
	"classroom_student_id" text,
	"student_user_id" text,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"subject_key" text,
	"grade_band" text,
	"curriculum_framework_key" text,
	"interaction_type" text,
	"phase_type" text,
	"concept_key" text,
	"scope_type" text,
	"source_title" text,
	"embedding_model" text,
	"embedding_version" text,
	"chunking_version" text,
	"content_hash" text,
	"source_updated_at" timestamp with time zone,
	"token_count" integer,
	"raw_content" text DEFAULT '' NOT NULL,
	"retrieval_content" text DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"embedding" vector(1024)
);
--> statement-breakpoint
CREATE TABLE "learning_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classroom_student_id" text NOT NULL,
	"topic_id" text,
	"session_id" text,
	"role" text NOT NULL,
	"interaction_type" text NOT NULL,
	"phase_id" integer,
	"phase_type" text,
	"concept_key" text,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "learning_interventions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classroom_id" text NOT NULL,
	"topic_id" text,
	"classroom_student_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"intervention_type" text DEFAULT 'reteach' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "learning_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "learning_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"topic_id" text,
	"classroom_student_id" text NOT NULL,
	"session_type" text NOT NULL,
	"session_locale" text DEFAULT 'en' NOT NULL,
	"session_status" text DEFAULT 'active' NOT NULL,
	"state_version" integer DEFAULT 1 NOT NULL,
	"state" jsonb DEFAULT '{"topicId":null,"topicTitle":"","frameworkVersionId":null,"activeFrameworkSnapshot":null,"groundingPackVersion":0,"contentScopeSnapshot":null,"recentMessageSummary":"","recentEvidence":[],"tutorNotes":[],"turnCount":0,"reportReady":false,"completed":false,"completionRequestedAt":null}'::jsonb,
	"opening_plan" jsonb,
	"summary" text,
	"completed_at" timestamp with time zone,
	CONSTRAINT "learning_sessions_status_check" CHECK ("learning_sessions"."session_status" in ('active', 'completed', 'abandoned'))
);
--> statement-breakpoint
CREATE TABLE "learning_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classroom_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"subject" text,
	"content_locale" text DEFAULT 'en' NOT NULL,
	"subject_key" text DEFAULT 'general' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"opening_preference" text DEFAULT 'auto' NOT NULL,
	"source_boundary" jsonb NOT NULL,
	"learning_outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"readiness_analysis" jsonb DEFAULT 'null'::jsonb,
	"readiness_source_hash" text,
	"readiness_generated_at" timestamp with time zone,
	"last_material_sync_at" timestamp with time zone,
	"topic_grounding_pack" jsonb,
	"topic_grounding_pack_built_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "student_access_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classroom_student_id" text NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "student_interest_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classroom_student_id" text NOT NULL,
	"profile" jsonb NOT NULL,
	"visibility" text DEFAULT 'private_to_student_and_agent' NOT NULL,
	"last_refreshed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "student_interest_profiles_classroom_student_id_unique" UNIQUE("classroom_student_id")
);
--> statement-breakpoint
CREATE TABLE "student_progress_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"topic_id" text NOT NULL,
	"classroom_student_id" text NOT NULL,
	"generated_from_session_id" text,
	"source_locale" text DEFAULT 'en' NOT NULL,
	"mastery_percent" integer DEFAULT 0 NOT NULL,
	"report" jsonb NOT NULL,
	"visibility" text DEFAULT 'teacher_only' NOT NULL,
	CONSTRAINT "student_progress_reports_visibility_check" CHECK ("student_progress_reports"."visibility" in ('teacher_only', 'teacher_and_guardian', 'teacher_student_shared'))
);
--> statement-breakpoint
CREATE TABLE "learning_teacher_chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classroom_student_id" text NOT NULL,
	"user_id" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"title" text DEFAULT 'New Chat' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teaching_media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classroom_id" text,
	"topic_id" text,
	"created_by_user_id" text NOT NULL,
	"source_type" text DEFAULT 'teacher_curated' NOT NULL,
	"asset_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"media_url" text NOT NULL,
	"thumbnail_url" text,
	"transcript" text,
	"duration_seconds" integer,
	"grade_band" text,
	"language" text DEFAULT 'en' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "teaching_media_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asset_id" text NOT NULL,
	"topic_id" text,
	"classroom_id" text,
	"outcome_id" text,
	"concept_key" text,
	"phase_type" text,
	"grade_band" text,
	"priority" integer DEFAULT 50 NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "teaching_media_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asset_id" text,
	"topic_id" text,
	"session_id" text,
	"classroom_student_id" text,
	"selection_source" text DEFAULT 'teacher_curated' NOT NULL,
	"reason" text NOT NULL,
	"expected_benefit" text,
	"follow_up_prompt" text,
	"relevance_score" integer,
	"usefulness_score" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "topic_material_upload_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"previous_attempt_id" text,
	"batch_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"file_name" text NOT NULL,
	"title" text,
	"description" text,
	"mime_type" text,
	"size_bytes" integer,
	"storage_bucket" text,
	"storage_path" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"stage" text DEFAULT 'upload' NOT NULL,
	"user_message" text,
	"internal_error" text,
	"error_code" text,
	"retryable" boolean,
	"queued_at" timestamp with time zone,
	"processing_started_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_message" text,
	"material_id" text,
	CONSTRAINT "topic_material_upload_attempts_status_check" CHECK ("topic_material_upload_attempts"."status" in ('queued', 'processing', 'succeeded', 'failed')),
	CONSTRAINT "topic_material_upload_attempts_stage_check" CHECK ("topic_material_upload_attempts"."stage" in ('upload', 'extraction', 'review', 'analysis', 'indexing', 'pack_build'))
);
--> statement-breakpoint
CREATE TABLE "topic_materials" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"topic_id" text NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"material_kind" text NOT NULL,
	"storage_bucket" text,
	"storage_path" text,
	"public_url" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer,
	"extraction_status" text DEFAULT 'pending' NOT NULL,
	"extraction_error" text,
	"indexing_status" text DEFAULT 'pending' NOT NULL,
	"indexing_error" text,
	"extracted_text" text,
	"source_document" jsonb DEFAULT 'null'::jsonb,
	"grounding_map" jsonb DEFAULT 'null'::jsonb,
	"coverage_review" jsonb DEFAULT 'null'::jsonb,
	"analysis" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "topic_materials_extraction_status_check" CHECK ("topic_materials"."extraction_status" in ('pending', 'processing', 'completed', 'failed')),
	CONSTRAINT "topic_materials_indexing_status_check" CHECK ("topic_materials"."indexing_status" in ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "consent_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text,
	"user_id" text,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"consent_key" text NOT NULL,
	"decision" text NOT NULL,
	"locale" text,
	"ip_hash" text,
	"user_agent" text,
	"evidence" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"privacy_request_id" text NOT NULL,
	"job_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text,
	"user_id" text,
	"classroom_student_id" text,
	"subject_type" text NOT NULL,
	"request_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"request_payload" jsonb DEFAULT '{}'::jsonb,
	"result_payload" jsonb DEFAULT '{}'::jsonb,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "respondent_access_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"survey_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"participant_id" text,
	"token_hash" text NOT NULL,
	"scope" text DEFAULT 'respondent_self_service' NOT NULL,
	"ip_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "respondent_access_tokens_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "expert_guidance_packs" ADD CONSTRAINT "expert_guidance_packs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_guidance_packs" ADD CONSTRAINT "expert_guidance_packs_active_version_id_expert_guidance_versions_id_fk" FOREIGN KEY ("active_version_id") REFERENCES "public"."expert_guidance_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_guidance_versions" ADD CONSTRAINT "expert_guidance_versions_pack_id_expert_guidance_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."expert_guidance_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_guidance_versions" ADD CONSTRAINT "expert_guidance_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "few_shot_examples" ADD CONSTRAINT "few_shot_examples_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_invitations" ADD CONSTRAINT "expert_invitations_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_invitations" ADD CONSTRAINT "expert_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_project_id_folders_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_edit_leases" ADD CONSTRAINT "survey_edit_leases_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_edit_leases" ADD CONSTRAINT "survey_edit_leases_holder_user_id_users_id_fk" FOREIGN KEY ("holder_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_revisions" ADD CONSTRAINT "survey_revisions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_feedback" ADD CONSTRAINT "platform_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_feedback" ADD CONSTRAINT "platform_feedback_classroom_student_id_classroom_students_id_fk" FOREIGN KEY ("classroom_student_id") REFERENCES "public"."classroom_students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_chat_sessions" ADD CONSTRAINT "analytics_chat_sessions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_chat_sessions" ADD CONSTRAINT "analytics_chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_feedback" ADD CONSTRAINT "participant_feedback_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_feedback" ADD CONSTRAINT "participant_feedback_conversation_id_survey_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."survey_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refinement_messages" ADD CONSTRAINT "refinement_messages_thread_id_refinement_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."refinement_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refinement_proposals" ADD CONSTRAINT "refinement_proposals_thread_id_refinement_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."refinement_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refinement_proposals" ADD CONSTRAINT "refinement_proposals_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refinement_threads" ADD CONSTRAINT "refinement_threads_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refinement_threads" ADD CONSTRAINT "refinement_threads_sample_conversation_id_sample_conversations_id_fk" FOREIGN KEY ("sample_conversation_id") REFERENCES "public"."sample_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refinement_threads" ADD CONSTRAINT "refinement_threads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_brief_patches" ADD CONSTRAINT "research_brief_patches_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_brief_patches" ADD CONSTRAINT "research_brief_patches_proposal_id_refinement_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."refinement_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_brief_patches" ADD CONSTRAINT "research_brief_patches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_conversations" ADD CONSTRAINT "sample_conversations_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_feedback_entries" ADD CONSTRAINT "sample_feedback_entries_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_feedback_entries" ADD CONSTRAINT "sample_feedback_entries_sample_conversation_id_sample_conversations_id_fk" FOREIGN KEY ("sample_conversation_id") REFERENCES "public"."sample_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_feedback_entries" ADD CONSTRAINT "sample_feedback_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_feedback_patches" ADD CONSTRAINT "sample_feedback_patches_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_feedback_patches" ADD CONSTRAINT "sample_feedback_patches_feedback_entry_id_sample_feedback_entries_id_fk" FOREIGN KEY ("feedback_entry_id") REFERENCES "public"."sample_feedback_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_analytics_facts" ADD CONSTRAINT "survey_analytics_facts_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_analytics_facts" ADD CONSTRAINT "survey_analytics_facts_session_id_survey_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."survey_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_analytics_snapshots" ADD CONSTRAINT "survey_analytics_snapshots_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_analytics_states" ADD CONSTRAINT "survey_analytics_states_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_briefs" ADD CONSTRAINT "survey_briefs_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_conducting_profiles" ADD CONSTRAINT "survey_conducting_profiles_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_conducting_profiles" ADD CONSTRAINT "survey_conducting_profiles_source_patch_id_sample_feedback_patches_id_fk" FOREIGN KEY ("source_patch_id") REFERENCES "public"."sample_feedback_patches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_conversations" ADD CONSTRAINT "survey_conversations_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_coverage_plans" ADD CONSTRAINT "survey_coverage_plans_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_creation_conversations" ADD CONSTRAINT "survey_creation_conversations_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_evidence" ADD CONSTRAINT "survey_evidence_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_evidence" ADD CONSTRAINT "survey_evidence_session_id_survey_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."survey_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_evidence" ADD CONSTRAINT "survey_evidence_turn_id_survey_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."survey_turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_session_insights" ADD CONSTRAINT "survey_session_insights_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_session_insights" ADD CONSTRAINT "survey_session_insights_session_id_survey_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."survey_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_sessions" ADD CONSTRAINT "survey_sessions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_turns" ADD CONSTRAINT "survey_turns_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_turns" ADD CONSTRAINT "survey_turns_session_id_survey_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."survey_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_project_id_folders_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_invitations" ADD CONSTRAINT "classroom_invitations_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_invitations" ADD CONSTRAINT "classroom_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_invitations" ADD CONSTRAINT "classroom_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_students" ADD CONSTRAINT "classroom_students_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_students" ADD CONSTRAINT "classroom_students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_students" ADD CONSTRAINT "classroom_students_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_teacher_user_id_users_id_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_conflicts" ADD CONSTRAINT "expert_conflicts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_conflicts" ADD CONSTRAINT "expert_conflicts_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_conflicts" ADD CONSTRAINT "expert_conflicts_framework_version_id_expert_framework_versions_id_fk" FOREIGN KEY ("framework_version_id") REFERENCES "public"."expert_framework_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_conflicts" ADD CONSTRAINT "expert_conflicts_crystallization_id_expert_crystallizations_id_fk" FOREIGN KEY ("crystallization_id") REFERENCES "public"."expert_crystallizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_conflicts" ADD CONSTRAINT "expert_conflicts_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_crystallizations" ADD CONSTRAINT "expert_crystallizations_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_crystallizations" ADD CONSTRAINT "expert_crystallizations_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_crystallizations" ADD CONSTRAINT "expert_crystallizations_framework_version_id_expert_framework_versions_id_fk" FOREIGN KEY ("framework_version_id") REFERENCES "public"."expert_framework_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_crystallizations" ADD CONSTRAINT "expert_crystallizations_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_framework_versions" ADD CONSTRAINT "expert_framework_versions_framework_id_expert_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."expert_frameworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_framework_versions" ADD CONSTRAINT "expert_framework_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD CONSTRAINT "expert_frameworks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD CONSTRAINT "expert_frameworks_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD CONSTRAINT "expert_frameworks_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_frameworks" ADD CONSTRAINT "expert_frameworks_active_version_id_expert_framework_versions_id_fk" FOREIGN KEY ("active_version_id") REFERENCES "public"."expert_framework_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_review_cases" ADD CONSTRAINT "expert_review_cases_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_review_cases" ADD CONSTRAINT "expert_review_cases_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_review_cases" ADD CONSTRAINT "expert_review_cases_classroom_student_id_classroom_students_id_fk" FOREIGN KEY ("classroom_student_id") REFERENCES "public"."classroom_students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_review_cases" ADD CONSTRAINT "expert_review_cases_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_review_cases" ADD CONSTRAINT "expert_review_cases_interaction_id_learning_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."learning_interactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_review_cases" ADD CONSTRAINT "expert_review_cases_framework_version_id_expert_framework_versions_id_fk" FOREIGN KEY ("framework_version_id") REFERENCES "public"."expert_framework_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_review_cases" ADD CONSTRAINT "expert_review_cases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence_embeddings" ADD CONSTRAINT "learning_evidence_embeddings_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence_embeddings" ADD CONSTRAINT "learning_evidence_embeddings_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence_embeddings" ADD CONSTRAINT "learning_evidence_embeddings_classroom_student_id_classroom_students_id_fk" FOREIGN KEY ("classroom_student_id") REFERENCES "public"."classroom_students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence_embeddings" ADD CONSTRAINT "learning_evidence_embeddings_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_interactions" ADD CONSTRAINT "learning_interactions_classroom_student_id_classroom_students_id_fk" FOREIGN KEY ("classroom_student_id") REFERENCES "public"."classroom_students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_interactions" ADD CONSTRAINT "learning_interactions_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_interactions" ADD CONSTRAINT "learning_interactions_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_interventions" ADD CONSTRAINT "learning_interventions_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_interventions" ADD CONSTRAINT "learning_interventions_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_interventions" ADD CONSTRAINT "learning_interventions_classroom_student_id_classroom_students_id_fk" FOREIGN KEY ("classroom_student_id") REFERENCES "public"."classroom_students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_interventions" ADD CONSTRAINT "learning_interventions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_messages" ADD CONSTRAINT "learning_messages_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_classroom_student_id_classroom_students_id_fk" FOREIGN KEY ("classroom_student_id") REFERENCES "public"."classroom_students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD CONSTRAINT "learning_topics_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD CONSTRAINT "learning_topics_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD CONSTRAINT "learning_topics_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_access_tokens" ADD CONSTRAINT "student_access_tokens_classroom_student_id_classroom_students_id_fk" FOREIGN KEY ("classroom_student_id") REFERENCES "public"."classroom_students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_access_tokens" ADD CONSTRAINT "student_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_interest_profiles" ADD CONSTRAINT "student_interest_profiles_classroom_student_id_classroom_students_id_fk" FOREIGN KEY ("classroom_student_id") REFERENCES "public"."classroom_students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_progress_reports" ADD CONSTRAINT "student_progress_reports_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_progress_reports" ADD CONSTRAINT "student_progress_reports_classroom_student_id_classroom_students_id_fk" FOREIGN KEY ("classroom_student_id") REFERENCES "public"."classroom_students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_progress_reports" ADD CONSTRAINT "student_progress_reports_generated_from_session_id_learning_sessions_id_fk" FOREIGN KEY ("generated_from_session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_teacher_chat_sessions" ADD CONSTRAINT "learning_teacher_chat_sessions_classroom_student_id_classroom_students_id_fk" FOREIGN KEY ("classroom_student_id") REFERENCES "public"."classroom_students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_teacher_chat_sessions" ADD CONSTRAINT "learning_teacher_chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_media_assets" ADD CONSTRAINT "teaching_media_assets_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_media_assets" ADD CONSTRAINT "teaching_media_assets_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_media_assets" ADD CONSTRAINT "teaching_media_assets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_media_bindings" ADD CONSTRAINT "teaching_media_bindings_asset_id_teaching_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."teaching_media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_media_bindings" ADD CONSTRAINT "teaching_media_bindings_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_media_bindings" ADD CONSTRAINT "teaching_media_bindings_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_media_usage_events" ADD CONSTRAINT "teaching_media_usage_events_asset_id_teaching_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."teaching_media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_media_usage_events" ADD CONSTRAINT "teaching_media_usage_events_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_media_usage_events" ADD CONSTRAINT "teaching_media_usage_events_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_media_usage_events" ADD CONSTRAINT "teaching_media_usage_events_classroom_student_id_classroom_students_id_fk" FOREIGN KEY ("classroom_student_id") REFERENCES "public"."classroom_students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD CONSTRAINT "topic_material_upload_attempts_previous_attempt_id_topic_material_upload_attempts_id_fk" FOREIGN KEY ("previous_attempt_id") REFERENCES "public"."topic_material_upload_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD CONSTRAINT "topic_material_upload_attempts_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD CONSTRAINT "topic_material_upload_attempts_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_material_upload_attempts" ADD CONSTRAINT "topic_material_upload_attempts_material_id_topic_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."topic_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_materials" ADD CONSTRAINT "topic_materials_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_materials" ADD CONSTRAINT "topic_materials_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_jobs" ADD CONSTRAINT "deletion_jobs_privacy_request_id_privacy_requests_id_fk" FOREIGN KEY ("privacy_request_id") REFERENCES "public"."privacy_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_classroom_student_id_classroom_students_id_fk" FOREIGN KEY ("classroom_student_id") REFERENCES "public"."classroom_students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "respondent_access_tokens" ADD CONSTRAINT "respondent_access_tokens_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "respondent_access_tokens" ADD CONSTRAINT "respondent_access_tokens_conversation_id_survey_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."survey_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expert_guidance_packs_feature_idx" ON "expert_guidance_packs" USING btree ("feature");--> statement-breakpoint
CREATE INDEX "expert_guidance_packs_type_idx" ON "expert_guidance_packs" USING btree ("artifact_type");--> statement-breakpoint
CREATE INDEX "expert_guidance_packs_status_idx" ON "expert_guidance_packs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "expert_guidance_versions_pack_id_idx" ON "expert_guidance_versions" USING btree ("pack_id");--> statement-breakpoint
CREATE INDEX "few_shot_examples_feature_idx" ON "few_shot_examples" USING btree ("feature");--> statement-breakpoint
CREATE INDEX "few_shot_examples_active_idx" ON "few_shot_examples" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "few_shot_examples_embedding_hnsw_idx" ON "few_shot_examples" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "few_shot_examples_retrieval_en_idx" ON "few_shot_examples" USING gin (to_tsvector('english', "retrieval_content"));--> statement-breakpoint
CREATE INDEX "few_shot_examples_retrieval_de_idx" ON "few_shot_examples" USING gin (to_tsvector('german', "retrieval_content"));--> statement-breakpoint
CREATE INDEX "few_shot_examples_retrieval_fr_idx" ON "few_shot_examples" USING gin (to_tsvector('french', "retrieval_content"));--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "expert_invitations_invited_user_id_idx" ON "expert_invitations" USING btree ("invited_user_id");--> statement-breakpoint
CREATE INDEX "expert_invitations_invited_by_user_id_idx" ON "expert_invitations" USING btree ("invited_by_user_id");--> statement-breakpoint
CREATE INDEX "expert_invitations_invited_email_idx" ON "expert_invitations" USING btree ("invited_email");--> statement-breakpoint
CREATE INDEX "expert_invitations_status_idx" ON "expert_invitations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "expert_invitations_pending_email_unique" ON "expert_invitations" USING btree ("invited_email") WHERE "expert_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification_tokens" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "usage_logs_user_id_idx" ON "usage_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_logs_survey_id_idx" ON "usage_logs" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "usage_logs_created_at_idx" ON "usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "usage_logs_type_idx" ON "usage_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "survey_edit_leases_holder_user_id_idx" ON "survey_edit_leases" USING btree ("holder_user_id");--> statement-breakpoint
CREATE INDEX "survey_edit_leases_expires_at_idx" ON "survey_edit_leases" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "platform_feedback_status_idx" ON "platform_feedback" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "platform_feedback_kind_idx" ON "platform_feedback" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "platform_feedback_role_idx" ON "platform_feedback" USING btree ("submitter_role");--> statement-breakpoint
CREATE INDEX "platform_feedback_user_idx" ON "platform_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "platform_feedback_student_idx" ON "platform_feedback" USING btree ("classroom_student_id");--> statement-breakpoint
CREATE INDEX "folders_user_id_idx" ON "folders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "folders_created_by_idx" ON "folders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "document_embeddings_survey_id_idx" ON "document_embeddings" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "document_embeddings_language_idx" ON "document_embeddings" USING btree ("language");--> statement-breakpoint
CREATE INDEX "document_embeddings_session_type_idx" ON "document_embeddings" USING btree ("session_type");--> statement-breakpoint
CREATE INDEX "document_embeddings_source_idx" ON "document_embeddings" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "document_embeddings_embedding_idx" ON "document_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "document_embeddings_source_chunk_unique" ON "document_embeddings" USING btree ("survey_id","source_type","source_id","chunk_index");--> statement-breakpoint
CREATE INDEX "document_embeddings_retrieval_en_idx" ON "document_embeddings" USING gin (to_tsvector('english', "retrieval_content"));--> statement-breakpoint
CREATE INDEX "document_embeddings_retrieval_de_idx" ON "document_embeddings" USING gin (to_tsvector('german', "retrieval_content"));--> statement-breakpoint
CREATE INDEX "document_embeddings_retrieval_fr_idx" ON "document_embeddings" USING gin (to_tsvector('french', "retrieval_content"));--> statement-breakpoint
CREATE INDEX "document_embeddings_retrieval_es_idx" ON "document_embeddings" USING gin (to_tsvector('spanish', "retrieval_content"));--> statement-breakpoint
CREATE INDEX "document_embeddings_retrieval_it_idx" ON "document_embeddings" USING gin (to_tsvector('italian', "retrieval_content"));--> statement-breakpoint
CREATE INDEX "voice_sessions_user_id_idx" ON "voice_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "voice_sessions_survey_id_idx" ON "voice_sessions" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "voice_sessions_started_at_idx" ON "voice_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_read_created_idx" ON "notifications" USING btree ("user_id","read","created_at");--> statement-breakpoint
CREATE INDEX "analytics_chat_sessions_survey_id_idx" ON "analytics_chat_sessions" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "analytics_chat_sessions_user_id_idx" ON "analytics_chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "participant_feedback_survey_id_idx" ON "participant_feedback" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "participant_feedback_conversation_id_idx" ON "participant_feedback" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "refinement_messages_thread_id_idx" ON "refinement_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "refinement_proposals_thread_id_idx" ON "refinement_proposals" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "refinement_proposals_survey_id_idx" ON "refinement_proposals" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "refinement_threads_survey_id_idx" ON "refinement_threads" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "research_brief_patches_survey_id_idx" ON "research_brief_patches" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "sample_conversations_survey_id_idx" ON "sample_conversations" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "sample_feedback_entries_survey_id_idx" ON "sample_feedback_entries" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "sample_feedback_entries_conversation_id_idx" ON "sample_feedback_entries" USING btree ("sample_conversation_id");--> statement-breakpoint
CREATE INDEX "sample_feedback_patches_survey_id_idx" ON "sample_feedback_patches" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "sample_feedback_patches_entry_id_idx" ON "sample_feedback_patches" USING btree ("feedback_entry_id");--> statement-breakpoint
CREATE INDEX "survey_analytics_facts_survey_id_idx" ON "survey_analytics_facts" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_analytics_facts_session_id_idx" ON "survey_analytics_facts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "survey_analytics_facts_node_id_idx" ON "survey_analytics_facts" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "survey_analytics_snapshots_survey_id_idx" ON "survey_analytics_snapshots" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_analytics_snapshots_latest_idx" ON "survey_analytics_snapshots" USING btree ("survey_id","is_latest");--> statement-breakpoint
CREATE INDEX "survey_analytics_states_survey_id_idx" ON "survey_analytics_states" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_briefs_survey_id_idx" ON "survey_briefs" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_briefs_program_id_idx" ON "survey_briefs" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "survey_conducting_profiles_survey_id_idx" ON "survey_conducting_profiles" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_conducting_profiles_mode_idx" ON "survey_conducting_profiles" USING btree ("survey_id","mode","is_active");--> statement-breakpoint
CREATE INDEX "survey_conversations_survey_id_idx" ON "survey_conversations" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_conversations_completed_idx" ON "survey_conversations" USING btree ("completed");--> statement-breakpoint
CREATE INDEX "survey_conversations_survey_completed_created_idx" ON "survey_conversations" USING btree ("survey_id","completed","created_at");--> statement-breakpoint
CREATE INDEX "survey_coverage_plans_survey_id_idx" ON "survey_coverage_plans" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_coverage_plans_active_idx" ON "survey_coverage_plans" USING btree ("survey_id","is_active");--> statement-breakpoint
CREATE INDEX "survey_creation_conversations_survey_id_idx" ON "survey_creation_conversations" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_creation_conversations_status_idx" ON "survey_creation_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "survey_evidence_survey_id_idx" ON "survey_evidence" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_evidence_session_id_idx" ON "survey_evidence" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "survey_evidence_node_id_idx" ON "survey_evidence" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "survey_session_insights_survey_id_idx" ON "survey_session_insights" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_session_insights_session_id_idx" ON "survey_session_insights" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "survey_sessions_survey_id_idx" ON "survey_sessions" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "survey_sessions_type_idx" ON "survey_sessions" USING btree ("survey_id","session_type");--> statement-breakpoint
CREATE INDEX "survey_sessions_source_idx" ON "survey_sessions" USING btree ("source_conversation_id");--> statement-breakpoint
CREATE INDEX "survey_turns_session_id_idx" ON "survey_turns" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "surveys_user_id_idx" ON "surveys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "surveys_classroom_id_idx" ON "surveys" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "surveys_delivery_mode_idx" ON "surveys" USING btree ("delivery_mode");--> statement-breakpoint
CREATE INDEX "surveys_shareable_link_idx" ON "surveys" USING btree ("shareable_link");--> statement-breakpoint
CREATE INDEX "surveys_custom_slug_idx" ON "surveys" USING btree ("custom_slug");--> statement-breakpoint
CREATE INDEX "surveys_status_idx" ON "surveys" USING btree ("status");--> statement-breakpoint
CREATE INDEX "surveys_user_updated_idx" ON "surveys" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "classroom_invitations_classroom_id_idx" ON "classroom_invitations" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "classroom_invitations_email_idx" ON "classroom_invitations" USING btree ("invited_email");--> statement-breakpoint
CREATE INDEX "classroom_invitations_status_idx" ON "classroom_invitations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "classroom_invitations_pending_unique" ON "classroom_invitations" USING btree ("classroom_id","invited_email") WHERE "classroom_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "classroom_students_classroom_id_idx" ON "classroom_students" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "classroom_students_user_id_idx" ON "classroom_students" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classroom_students_classroom_user_unique" ON "classroom_students" USING btree ("classroom_id","user_id") WHERE "classroom_students"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "classrooms_teacher_user_id_idx" ON "classrooms" USING btree ("teacher_user_id");--> statement-breakpoint
CREATE INDEX "classrooms_grade_band_idx" ON "classrooms" USING btree ("grade_band");--> statement-breakpoint
CREATE INDEX "courses_key_idx" ON "courses" USING btree ("key");--> statement-breakpoint
CREATE INDEX "courses_status_idx" ON "courses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "courses_created_by_user_id_idx" ON "courses" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "expert_conflicts_course_idx" ON "expert_conflicts" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "expert_conflicts_topic_idx" ON "expert_conflicts" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "expert_conflicts_framework_version_idx" ON "expert_conflicts" USING btree ("framework_version_id");--> statement-breakpoint
CREATE INDEX "expert_crystallizations_course_idx" ON "expert_crystallizations" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "expert_crystallizations_topic_idx" ON "expert_crystallizations" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "expert_crystallizations_framework_version_idx" ON "expert_crystallizations" USING btree ("framework_version_id");--> statement-breakpoint
CREATE INDEX "expert_framework_versions_framework_idx" ON "expert_framework_versions" USING btree ("framework_id");--> statement-breakpoint
CREATE INDEX "expert_frameworks_course_id_idx" ON "expert_frameworks" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "expert_frameworks_subject_key_idx" ON "expert_frameworks" USING btree ("subject_key");--> statement-breakpoint
CREATE INDEX "expert_frameworks_classroom_idx" ON "expert_frameworks" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "expert_frameworks_topic_idx" ON "expert_frameworks" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "expert_review_cases_course_idx" ON "expert_review_cases" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "expert_review_cases_topic_idx" ON "expert_review_cases" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "expert_review_cases_student_idx" ON "expert_review_cases" USING btree ("classroom_student_id");--> statement-breakpoint
CREATE INDEX "expert_review_cases_session_idx" ON "expert_review_cases" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "learning_evidence_embeddings_topic_idx" ON "learning_evidence_embeddings" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "learning_evidence_embeddings_classroom_idx" ON "learning_evidence_embeddings" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "learning_evidence_embeddings_student_idx" ON "learning_evidence_embeddings" USING btree ("classroom_student_id");--> statement-breakpoint
CREATE INDEX "learning_evidence_embeddings_user_idx" ON "learning_evidence_embeddings" USING btree ("student_user_id");--> statement-breakpoint
CREATE INDEX "learning_evidence_embeddings_source_idx" ON "learning_evidence_embeddings" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "learning_evidence_embeddings_language_idx" ON "learning_evidence_embeddings" USING btree ("language");--> statement-breakpoint
CREATE INDEX "learning_evidence_embeddings_subject_idx" ON "learning_evidence_embeddings" USING btree ("subject_key");--> statement-breakpoint
CREATE INDEX "learning_evidence_embeddings_embedding_idx" ON "learning_evidence_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "learning_evidence_embeddings_source_chunk_unique" ON "learning_evidence_embeddings" USING btree ("source_type","source_id","chunk_index","language");--> statement-breakpoint
CREATE INDEX "learning_evidence_embeddings_retrieval_en_idx" ON "learning_evidence_embeddings" USING gin (to_tsvector('english', "retrieval_content"));--> statement-breakpoint
CREATE INDEX "learning_evidence_embeddings_retrieval_de_idx" ON "learning_evidence_embeddings" USING gin (to_tsvector('german', "retrieval_content"));--> statement-breakpoint
CREATE INDEX "learning_evidence_embeddings_retrieval_fr_idx" ON "learning_evidence_embeddings" USING gin (to_tsvector('french', "retrieval_content"));--> statement-breakpoint
CREATE INDEX "learning_interactions_student_id_idx" ON "learning_interactions" USING btree ("classroom_student_id");--> statement-breakpoint
CREATE INDEX "learning_interactions_topic_id_idx" ON "learning_interactions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "learning_interactions_session_id_idx" ON "learning_interactions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "learning_interactions_phase_idx" ON "learning_interactions" USING btree ("session_id","phase_id");--> statement-breakpoint
CREATE INDEX "learning_interventions_classroom_idx" ON "learning_interventions" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "learning_interventions_topic_idx" ON "learning_interventions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "learning_interventions_student_idx" ON "learning_interventions" USING btree ("classroom_student_id");--> statement-breakpoint
CREATE INDEX "learning_interventions_status_idx" ON "learning_interventions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "learning_messages_session_id_idx" ON "learning_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "learning_sessions_topic_id_idx" ON "learning_sessions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "learning_sessions_student_id_idx" ON "learning_sessions" USING btree ("classroom_student_id");--> statement-breakpoint
CREATE INDEX "learning_sessions_type_idx" ON "learning_sessions" USING btree ("session_type");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_sessions_active_topic_unique" ON "learning_sessions" USING btree ("classroom_student_id","topic_id","session_type","session_locale") WHERE "learning_sessions"."topic_id" is not null and "learning_sessions"."session_status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "learning_sessions_active_non_topic_unique" ON "learning_sessions" USING btree ("classroom_student_id","session_type","session_locale") WHERE "learning_sessions"."topic_id" is null and "learning_sessions"."session_status" = 'active';--> statement-breakpoint
CREATE INDEX "learning_topics_classroom_id_idx" ON "learning_topics" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "learning_topics_created_by_user_id_idx" ON "learning_topics" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "learning_topics_course_id_idx" ON "learning_topics" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "learning_topics_status_idx" ON "learning_topics" USING btree ("status");--> statement-breakpoint
CREATE INDEX "learning_topics_subject_key_idx" ON "learning_topics" USING btree ("subject_key");--> statement-breakpoint
CREATE INDEX "student_access_tokens_student_id_idx" ON "student_access_tokens" USING btree ("classroom_student_id");--> statement-breakpoint
CREATE INDEX "student_access_tokens_user_id_idx" ON "student_access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "student_access_tokens_token_hash_idx" ON "student_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "student_access_tokens_token_hash_unique" ON "student_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "student_interest_profiles_student_id_idx" ON "student_interest_profiles" USING btree ("classroom_student_id");--> statement-breakpoint
CREATE INDEX "student_progress_reports_topic_id_idx" ON "student_progress_reports" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "student_progress_reports_student_id_idx" ON "student_progress_reports" USING btree ("classroom_student_id");--> statement-breakpoint
CREATE INDEX "learning_teacher_chat_sessions_student_idx" ON "learning_teacher_chat_sessions" USING btree ("classroom_student_id");--> statement-breakpoint
CREATE INDEX "learning_teacher_chat_sessions_user_idx" ON "learning_teacher_chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "teaching_media_assets_classroom_idx" ON "teaching_media_assets" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "teaching_media_assets_topic_idx" ON "teaching_media_assets" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "teaching_media_assets_status_idx" ON "teaching_media_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "teaching_media_assets_asset_type_idx" ON "teaching_media_assets" USING btree ("asset_type");--> statement-breakpoint
CREATE INDEX "teaching_media_bindings_asset_idx" ON "teaching_media_bindings" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "teaching_media_bindings_topic_idx" ON "teaching_media_bindings" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "teaching_media_bindings_classroom_idx" ON "teaching_media_bindings" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "teaching_media_bindings_lookup_idx" ON "teaching_media_bindings" USING btree ("topic_id","concept_key","phase_type","priority");--> statement-breakpoint
CREATE INDEX "teaching_media_usage_events_topic_idx" ON "teaching_media_usage_events" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "teaching_media_usage_events_session_idx" ON "teaching_media_usage_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "teaching_media_usage_events_student_idx" ON "teaching_media_usage_events" USING btree ("classroom_student_id");--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_topic_id_idx" ON "topic_material_upload_attempts" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_batch_id_idx" ON "topic_material_upload_attempts" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_status_idx" ON "topic_material_upload_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_previous_attempt_id_idx" ON "topic_material_upload_attempts" USING btree ("previous_attempt_id");--> statement-breakpoint
CREATE INDEX "topic_material_upload_attempts_failed_at_idx" ON "topic_material_upload_attempts" USING btree ("failed_at");--> statement-breakpoint
CREATE INDEX "topic_materials_topic_id_idx" ON "topic_materials" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "topic_materials_uploaded_by_user_id_idx" ON "topic_materials" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "consent_events_user_idx" ON "consent_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consent_events_subject_idx" ON "consent_events" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "deletion_jobs_request_idx" ON "deletion_jobs" USING btree ("privacy_request_id");--> statement-breakpoint
CREATE INDEX "deletion_jobs_status_idx" ON "deletion_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deletion_jobs_target_idx" ON "deletion_jobs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "privacy_requests_user_idx" ON "privacy_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "privacy_requests_status_idx" ON "privacy_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "privacy_requests_type_idx" ON "privacy_requests" USING btree ("request_type");--> statement-breakpoint
CREATE INDEX "respondent_access_tokens_survey_idx" ON "respondent_access_tokens" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "respondent_access_tokens_conversation_idx" ON "respondent_access_tokens" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "respondent_access_tokens_hash_idx" ON "respondent_access_tokens" USING btree ("token_hash");