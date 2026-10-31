import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { createDatabase } from "./database.ts";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

/**
 * Applies core's pending migrations, as core's role. Run it as its own step
 * before core starts; core never migrates at boot.
 */
export function migrate(databaseUrl: string): Promise<void> {
  return migrateFrom(migrationsFolder, databaseUrl);
}

/**
 * Applies the Drizzle migrations in `folder` to core's schema.
 *
 * This follows Drizzle's own Postgres migrator and keeps its journal table,
 * `core.__drizzle_migrations`, but skips its first statement. That is
 * `CREATE SCHEMA IF NOT EXISTS`, which Postgres refuses to a role without
 * CREATE on the database even when the schema exists, and provisioning has
 * already created the schema.
 */
export async function migrateFrom(
  folder: string,
  databaseUrl: string,
): Promise<void> {
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  const db = createDatabase(databaseUrl);
  try {
    await db.execute(sql`
      create table if not exists core.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )`);
    await db.transaction(async (tx) => {
      const [last] = await tx.execute<{ created_at: string }>(
        sql`select created_at from core.__drizzle_migrations order by created_at desc limit 1`,
      );
      for (const migration of migrations) {
        if (last && Number(last.created_at) >= migration.folderMillis) continue;
        for (const statement of migration.sql) {
          await tx.execute(sql.raw(statement));
        }
        await tx.execute(
          sql`insert into core.__drizzle_migrations (hash, created_at) values (${migration.hash}, ${migration.folderMillis})`,
        );
      }
    });
  } finally {
    await db.$client.end();
  }
}
