CREATE TABLE "note" (
	"id" serial PRIMARY KEY NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
INSERT INTO "note" ("body") VALUES ('first');
