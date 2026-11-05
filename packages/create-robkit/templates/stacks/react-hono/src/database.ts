import { readDatabaseUrl } from "@robkit/session/input";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

let db: PostgresJsDatabase<typeof schema> | undefined;

/** The app's database, as its own role, connected on first use. */
export function database(): PostgresJsDatabase<typeof schema> {
  if (db) return db;
  const url = readDatabaseUrl(process.env);
  if (typeof url !== "string") throw new Error(url.error);
  db = drizzle({ client: postgres(url, { max: 2 }), schema });
  return db;
}
