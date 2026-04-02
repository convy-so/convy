BEGIN;

CREATE TABLE IF NOT EXISTS "classroom_teacher_access" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "classroom_id" text NOT NULL REFERENCES "classrooms"("id") ON DELETE cascade,
  "teacher_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "granted_by_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "access_level" text DEFAULT 'collaborator' NOT NULL
);

CREATE INDEX IF NOT EXISTS "classroom_teacher_access_classroom_idx"
  ON "classroom_teacher_access" ("classroom_id");

CREATE INDEX IF NOT EXISTS "classroom_teacher_access_teacher_idx"
  ON "classroom_teacher_access" ("teacher_user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "classroom_teacher_access_unique"
  ON "classroom_teacher_access" ("classroom_id", "teacher_user_id");

CREATE TABLE IF NOT EXISTS "classroom_access_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "classroom_id" text NOT NULL REFERENCES "classrooms"("id") ON DELETE cascade,
  "requester_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "status" text DEFAULT 'pending' NOT NULL,
  "message" text,
  "resolved_by_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "resolved_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "classroom_access_requests_classroom_idx"
  ON "classroom_access_requests" ("classroom_id");

CREATE INDEX IF NOT EXISTS "classroom_access_requests_requester_idx"
  ON "classroom_access_requests" ("requester_user_id");

CREATE INDEX IF NOT EXISTS "classroom_access_requests_status_idx"
  ON "classroom_access_requests" ("status");

CREATE UNIQUE INDEX IF NOT EXISTS "classroom_access_requests_unique"
  ON "classroom_access_requests" ("classroom_id", "requester_user_id", "status");

INSERT INTO "classroom_teacher_access" (
  "id",
  "created_at",
  "updated_at",
  "classroom_id",
  "teacher_user_id",
  "granted_by_user_id",
  "access_level"
)
SELECT
  'cta_' || "id",
  "created_at",
  "updated_at",
  "id",
  "teacher_user_id",
  "teacher_user_id",
  'owner'
FROM "classrooms"
ON CONFLICT ("classroom_id", "teacher_user_id") DO NOTHING;

COMMIT;
