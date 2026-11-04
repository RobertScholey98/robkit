import { Kysely, PostgresDialect, sql } from "kysely";
import { Migrator } from "kysely/migration";
import { Pool } from "pg";
import { migrations } from "./migrations/index.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const db = new Kysely<unknown>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: databaseUrl, max: 1 }),
  }),
});
try {
  // Kysely's migrator looks for its tables by name in every schema, so it
  // would find another Kysely app's. Name the app's own: the first on its
  // role's search path. It already exists, so the migrator creates none,
  // which the app's role may not.
  const { rows } = await sql<{
    schema: string | null;
  }>`select current_schema() as schema`.execute(db);
  const schema = rows[0]?.schema;
  if (!schema) throw new Error("The app's role has no schema to migrate");

  const migrator = new Migrator({
    db,
    provider: { getMigrations: () => Promise.resolve(migrations) },
    migrationTableSchema: schema,
  });
  const { error, results = [] } = await migrator.migrateToLatest();
  for (const result of results) {
    if (result.status === "Error") {
      console.error(`migration ${result.migrationName} failed`);
    }
  }
  if (error !== undefined) {
    throw new Error("migrating failed", { cause: error });
  }
} finally {
  await db.destroy();
}
console.log("migrated");
