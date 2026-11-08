import { defineConfig } from "drizzle-kit";

// pnpm db:generate writes a migration for each change to src/schema.ts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
