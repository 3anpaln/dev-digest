ALTER TABLE "skills" ADD COLUMN "convention_origin" jsonb;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "scan_id" uuid;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "original_rule" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "original_scope" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "decision" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
UPDATE "conventions" SET "decision" = 'accepted' WHERE "accepted";--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence" jsonb;--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_scan_id_jobs_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conventions_scan_idx" ON "conventions" USING btree ("scan_id");
