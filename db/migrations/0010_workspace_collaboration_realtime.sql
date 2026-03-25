CREATE TABLE "survey_editors" (
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "granted_by" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("survey_id", "user_id")
);

CREATE INDEX "survey_editors_survey_id_idx" ON "survey_editors" ("survey_id");
CREATE INDEX "survey_editors_user_id_idx" ON "survey_editors" ("user_id");

CREATE TABLE "survey_editor_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "requester_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "resolved_by" text REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "survey_editor_requests_survey_id_idx" ON "survey_editor_requests" ("survey_id");
CREATE INDEX "survey_editor_requests_requester_id_idx" ON "survey_editor_requests" ("requester_id");
CREATE INDEX "survey_editor_requests_status_idx" ON "survey_editor_requests" ("status");

CREATE TABLE "survey_collaboration_comments" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "context_type" text NOT NULL,
  "context_id" text NOT NULL,
  "author_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE INDEX "survey_collab_comments_survey_id_idx" ON "survey_collaboration_comments" ("survey_id");
CREATE INDEX "survey_collab_comments_context_idx" ON "survey_collaboration_comments" ("survey_id", "context_type", "context_id");
CREATE INDEX "survey_collab_comments_author_id_idx" ON "survey_collaboration_comments" ("author_id");

CREATE TABLE "survey_edit_leases" (
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "stage" text NOT NULL,
  "holder_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "holder_session_id" text,
  "lease_token" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("survey_id", "stage")
);

CREATE INDEX "survey_edit_leases_holder_user_id_idx" ON "survey_edit_leases" ("holder_user_id");
CREATE INDEX "survey_edit_leases_expires_at_idx" ON "survey_edit_leases" ("expires_at");

CREATE TABLE "survey_revisions" (
  "survey_id" text PRIMARY KEY NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "workspace_revision" integer DEFAULT 0 NOT NULL,
  "survey_revision" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "workspace_revisions" (
  "workspace_id" text PRIMARY KEY NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "revision" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "collaboration_events" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "workspace_id" text REFERENCES "organization"("id") ON DELETE CASCADE,
  "survey_id" text REFERENCES "surveys"("id") ON DELETE CASCADE,
  "scope" text NOT NULL,
  "revision" integer NOT NULL,
  "event_type" text NOT NULL,
  "actor_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "payload" jsonb NOT NULL
);

CREATE INDEX "collaboration_events_workspace_idx" ON "collaboration_events" ("workspace_id", "revision");
CREATE INDEX "collaboration_events_survey_idx" ON "collaboration_events" ("survey_id", "revision");
CREATE INDEX "collaboration_events_event_type_idx" ON "collaboration_events" ("event_type");

CREATE TABLE "workspace_outbox" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "workspace_id" text REFERENCES "organization"("id") ON DELETE CASCADE,
  "survey_id" text REFERENCES "surveys"("id") ON DELETE CASCADE,
  "scope" text NOT NULL,
  "channel" text NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "published_at" timestamp with time zone
);

CREATE INDEX "workspace_outbox_scope_idx" ON "workspace_outbox" ("scope", "published_at");
CREATE INDEX "workspace_outbox_workspace_idx" ON "workspace_outbox" ("workspace_id", "published_at");
CREATE INDEX "workspace_outbox_survey_idx" ON "workspace_outbox" ("survey_id", "published_at");
