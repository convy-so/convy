CREATE TABLE "survey_personality_assignments" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "mode" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "assignment" jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL
);

CREATE INDEX "survey_personality_assignments_survey_id_idx"
  ON "survey_personality_assignments" ("survey_id");
CREATE INDEX "survey_personality_assignments_mode_idx"
  ON "survey_personality_assignments" ("survey_id", "mode", "is_active");

CREATE TABLE "playbooks" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "survey_id" text REFERENCES "surveys"("id") ON DELETE CASCADE,
  "organization_id" text REFERENCES "organizations"("id") ON DELETE CASCADE,
  "created_by" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scope" text NOT NULL,
  "phase" text NOT NULL,
  "name" text NOT NULL,
  "status" text NOT NULL,
  "latest_version" integer DEFAULT 1 NOT NULL,
  "active_version_id" text
);

CREATE INDEX "playbooks_survey_id_idx" ON "playbooks" ("survey_id");
CREATE INDEX "playbooks_organization_id_idx" ON "playbooks" ("organization_id");
CREATE INDEX "playbooks_scope_phase_idx" ON "playbooks" ("scope", "phase");

CREATE TABLE "playbook_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "playbook_id" text NOT NULL REFERENCES "playbooks"("id") ON DELETE CASCADE,
  "version" integer DEFAULT 1 NOT NULL,
  "status" text NOT NULL,
  "input" jsonb NOT NULL,
  "interpretation" jsonb NOT NULL,
  "preview" jsonb NOT NULL,
  "created_by" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "approved_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" timestamp
);

CREATE INDEX "playbook_versions_playbook_id_idx"
  ON "playbook_versions" ("playbook_id");
CREATE UNIQUE INDEX "playbook_versions_unique_version"
  ON "playbook_versions" ("playbook_id", "version");

ALTER TABLE "playbooks"
  ADD CONSTRAINT "playbooks_active_version_fk"
  FOREIGN KEY ("active_version_id")
  REFERENCES "playbook_versions"("id")
  ON DELETE SET NULL;

CREATE TABLE "survey_playbook_attachments" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "playbook_id" text NOT NULL REFERENCES "playbooks"("id") ON DELETE CASCADE,
  "attached_by" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "is_active" boolean DEFAULT true NOT NULL
);

CREATE INDEX "survey_playbook_attachments_survey_id_idx"
  ON "survey_playbook_attachments" ("survey_id");
CREATE INDEX "survey_playbook_attachments_playbook_id_idx"
  ON "survey_playbook_attachments" ("playbook_id");
CREATE UNIQUE INDEX "survey_playbook_attachments_unique"
  ON "survey_playbook_attachments" ("survey_id", "playbook_id");

CREATE TABLE "refinement_threads" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL UNIQUE REFERENCES "surveys"("id") ON DELETE CASCADE,
  "sample_conversation_id" text REFERENCES "sample_conversations"("id") ON DELETE SET NULL,
  "created_by" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "summary" text
);

CREATE INDEX "refinement_threads_survey_id_idx" ON "refinement_threads" ("survey_id");

CREATE TABLE "refinement_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "thread_id" text NOT NULL REFERENCES "refinement_threads"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "message" jsonb NOT NULL
);

CREATE INDEX "refinement_messages_thread_id_idx" ON "refinement_messages" ("thread_id");

CREATE TABLE "refinement_proposals" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "thread_id" text NOT NULL REFERENCES "refinement_threads"("id") ON DELETE CASCADE,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "status" text NOT NULL,
  "original_request" text NOT NULL,
  "interpretation" text NOT NULL,
  "runtime_effect" jsonb NOT NULL,
  "payload" jsonb NOT NULL,
  "proposal" jsonb NOT NULL
);

CREATE INDEX "refinement_proposals_thread_id_idx" ON "refinement_proposals" ("thread_id");
CREATE INDEX "refinement_proposals_survey_id_idx" ON "refinement_proposals" ("survey_id");

CREATE TABLE "research_brief_patches" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "proposal_id" text REFERENCES "refinement_proposals"("id") ON DELETE SET NULL,
  "patch" jsonb NOT NULL,
  "created_by" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "research_brief_patches_survey_id_idx" ON "research_brief_patches" ("survey_id");
