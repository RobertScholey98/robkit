CREATE TABLE "core"."code_roles" (
	"code_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "code_roles_code_id_role_id_pk" PRIMARY KEY("code_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "core"."roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "core"."code_roles" ADD CONSTRAINT "code_roles_code_id_access_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "core"."access_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."code_roles" ADD CONSTRAINT "code_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The starter roles every install begins with.
INSERT INTO "core"."roles" ("name") VALUES ('Family'), ('Friends');
