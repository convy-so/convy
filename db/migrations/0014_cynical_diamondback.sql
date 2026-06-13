ALTER TABLE "topic_materials" ADD COLUMN "source_document" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "topic_materials" ADD COLUMN "grounding_map" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "topic_materials" ADD COLUMN "coverage_review" jsonb DEFAULT 'null'::jsonb;