CREATE TABLE "core"."access_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "access_codes_code_shape" CHECK ("core"."access_codes"."code" ~ '^[A-Z0-9]{3,32}$')
);
--> statement-breakpoint
ALTER TABLE "core"."sessions" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD COLUMN "code_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_code_id_access_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "core"."access_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_one_holder" CHECK (num_nonnulls("core"."sessions"."owner_id", "core"."sessions"."code_id") = 1);--> statement-breakpoint
-- The test code. Core refuses it unless the install's domain is local.
INSERT INTO "core"."access_codes" ("code", "name") VALUES ('TEST', 'Test');
