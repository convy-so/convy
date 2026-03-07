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
ALTER TABLE "analytics_chat_sessions" ADD CONSTRAINT "analytics_chat_sessions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_chat_sessions" ADD CONSTRAINT "analytics_chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_chat_sessions_survey_id_idx" ON "analytics_chat_sessions" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "analytics_chat_sessions_user_id_idx" ON "analytics_chat_sessions" USING btree ("user_id");