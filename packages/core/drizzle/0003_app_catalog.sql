CREATE TABLE "core"."app_roles" (
	"app_slug" text NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "app_roles_app_slug_role_id_pk" PRIMARY KEY("app_slug","role_id")
);
--> statement-breakpoint
CREATE TABLE "core"."apps" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"access" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apps_access_kind" CHECK ("core"."apps"."access" in ('open', 'roles', 'owner'))
);
--> statement-breakpoint
ALTER TABLE "core"."app_roles" ADD CONSTRAINT "app_roles_app_slug_apps_slug_fk" FOREIGN KEY ("app_slug") REFERENCES "core"."apps"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."app_roles" ADD CONSTRAINT "app_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE cascade ON UPDATE no action;