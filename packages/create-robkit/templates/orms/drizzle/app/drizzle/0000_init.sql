CREATE TABLE "visit" (
	"id" serial PRIMARY KEY NOT NULL,
	"viewer" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
