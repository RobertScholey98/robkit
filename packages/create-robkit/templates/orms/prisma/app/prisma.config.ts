import { basename } from "node:path";
import { defineConfig } from "prisma/config";

// The app's folder name is its slug, and its schema shares the name.
const schema = basename(import.meta.dirname);
const databaseUrl = process.env.DATABASE_URL;

/** `DATABASE_URL`, pointed at the app's schema, as Prisma's commands take it. */
function inAppSchema(url: string): string {
  const withSchema = new URL(url);
  withSchema.searchParams.set("schema", schema);
  return withSchema.href;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // prisma generate needs no database.
  ...(databaseUrl && { datasource: { url: inAppSchema(databaseUrl) } }),
});
