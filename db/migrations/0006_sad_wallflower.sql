CREATE TYPE "public"."expert_invitation_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "expert_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_user_id" text NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"invited_email" text NOT NULL,
	"invited_name" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"status" "expert_invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "expert_invitations_email_lowercase_check" CHECK (lower("expert_invitations"."invited_email") = "expert_invitations"."invited_email")
);
--> statement-breakpoint
ALTER TABLE "expert_invitations" ADD CONSTRAINT "expert_invitations_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_invitations" ADD CONSTRAINT "expert_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expert_invitations_invited_user_id_idx" ON "expert_invitations" USING btree ("invited_user_id");--> statement-breakpoint
CREATE INDEX "expert_invitations_invited_by_user_id_idx" ON "expert_invitations" USING btree ("invited_by_user_id");--> statement-breakpoint
CREATE INDEX "expert_invitations_invited_email_idx" ON "expert_invitations" USING btree ("invited_email");--> statement-breakpoint
CREATE INDEX "expert_invitations_status_idx" ON "expert_invitations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "expert_invitations_pending_email_unique" ON "expert_invitations" USING btree ("invited_email") WHERE "expert_invitations"."status" = 'pending';