import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

let db: PostgresJsDatabase<typeof schema> | undefined;

/** The app's database, as its own role, connected on first use. */
export function database(): PostgresJsDatabase<typeof schema> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  db ??= drizzle({ client: postgres(url, { max: 2 }), schema });
  return db;
}
