ALTER TABLE "surveys"
ADD COLUMN "classroom_id" text REFERENCES "classrooms"("id") ON DELETE cascade;

ALTER TABLE "surveys"
ADD COLUMN "delivery_mode" text DEFAULT 'link' NOT NULL;

CREATE INDEX "surveys_classroom_id_idx" ON "surveys" ("classroom_id");
CREATE INDEX "surveys_delivery_mode_idx" ON "surveys" ("delivery_mode");
