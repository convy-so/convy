CREATE TABLE "expert_eval_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dataset_id" text NOT NULL,
	"case_key" text NOT NULL,
	"ordinal" integer NOT NULL,
	"prompt" text NOT NULL,
	"expected_behavior" text NOT NULL,
	"reference_answer" text,
	"evaluation_focus" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "expert_eval_cases_dataset_case_key_unique" UNIQUE("dataset_id","case_key")
);
--> statement-breakpoint
CREATE TABLE "expert_eval_datasets" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"preset_key" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"family" text NOT NULL,
	"subject_key" text,
	"case_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "expert_eval_datasets_preset_key_unique" UNIQUE("preset_key"),
	CONSTRAINT "expert_eval_datasets_status_check" CHECK ("expert_eval_datasets"."status" in ('draft', 'ready', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "expert_eval_cases" ADD CONSTRAINT "expert_eval_cases_dataset_id_expert_eval_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."expert_eval_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expert_eval_cases_dataset_idx" ON "expert_eval_cases" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "expert_eval_datasets_family_idx" ON "expert_eval_datasets" USING btree ("family");