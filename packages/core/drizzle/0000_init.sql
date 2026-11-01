CREATE TABLE "core"."owner" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	CONSTRAINT "owner_singleton_unique" UNIQUE("singleton"),
	CONSTRAINT "owner_singleton" CHECK ("core"."owner"."singleton")
);
--> statement-breakpoint
CREATE TABLE "core"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."signing_keys" (
	"kid" text PRIMARY KEY NOT NULL,
	"private_jwk" jsonb NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_owner_id_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "core"."owner"("id") ON DELETE cascade ON UPDATE no action;