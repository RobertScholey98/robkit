import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./schema.ts";

let db: Kysely<Database> | undefined;

/** The app's database, as its own role, connected on first use. */
export function database(): Kysely<Database> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  db ??= new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: url, max: 2 }),
    }),
  });
  return db;
}
