BEGIN;

CREATE TABLE IF NOT EXISTS "departments" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "code" text,
  "description" text,
  "head_user_id" text REFERENCES "users"("id") ON DELETE set null
);

CREATE INDEX IF NOT EXISTS "departments_organization_id_idx"
  ON "departments" ("organization_id");

CREATE INDEX IF NOT EXISTS "departments_head_user_id_idx"
  ON "departments" ("head_user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "departments_org_name_unique"
  ON "departments" ("organization_id", "name");

ALTER TABLE "classrooms"
  ADD COLUMN IF NOT EXISTS "department_id" text REFERENCES "departments"("id") ON DELETE set null;

CREATE INDEX IF NOT EXISTS "classrooms_department_id_idx"
  ON "classrooms" ("department_id");

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "department_id" text REFERENCES "departments"("id") ON DELETE set null;

CREATE INDEX IF NOT EXISTS "projects_department_id_idx"
  ON "projects" ("department_id");

ALTER TABLE "surveys"
  ADD COLUMN IF NOT EXISTS "department_id" text REFERENCES "departments"("id") ON DELETE set null;

CREATE INDEX IF NOT EXISTS "surveys_department_id_idx"
  ON "surveys" ("department_id");

COMMIT;
