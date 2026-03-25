CREATE TABLE IF NOT EXISTS "survey_analytics_states" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE cascade UNIQUE,
  "state" jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "survey_analytics_states_survey_id_idx"
  ON "survey_analytics_states" ("survey_id");

CREATE TABLE IF NOT EXISTS "survey_analytics_facts" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "survey_id" text NOT NULL REFERENCES "surveys"("id") ON DELETE cascade,
  "session_id" text NOT NULL REFERENCES "survey_sessions"("id") ON DELETE cascade,
  "node_id" text NOT NULL,
  "fact" jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "survey_analytics_facts_survey_id_idx"
  ON "survey_analytics_facts" ("survey_id");
CREATE INDEX IF NOT EXISTS "survey_analytics_facts_session_id_idx"
  ON "survey_analytics_facts" ("session_id");
CREATE INDEX IF NOT EXISTS "survey_analytics_facts_node_id_idx"
  ON "survey_analytics_facts" ("node_id");
