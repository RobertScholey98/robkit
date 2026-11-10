import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";
import { createDatabase, type Database } from "./database.ts";

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
 * already created the schema. It locks the journal while it migrates, as
 * the Go stack's migrator does, so two runs at once apply each migration
 * once.
 */
export async function migrateFrom(
  folder: string,
  databaseUrl: string,
): Promise<void> {
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  const db = createDatabase(databaseUrl);
  try {
    await createJournal(db);
    await db.transaction(async (tx) => {
      // Two cores can start together. The second waits here until the
      // first commits, then reads what it applied. Only core's role can
      // lock a table in core's schema, unlike an advisory key, which any
      // role in the shared database could hold.
      await tx.execute(
        sql`lock table core.__drizzle_migrations in exclusive mode`,
      );
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

/**
 * Creates core's journal table unless it exists. Two runs that both find it
 * missing both try to create it, and Postgres refuses the later one. That
 * one finds the table there on its next look.
 */
async function createJournal(db: Database): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await db.execute(sql`
        create table if not exists core.__drizzle_migrations (
          id serial primary key,
          hash text not null,
          created_at bigint
        )`);
      return;
    } catch (error) {
      if (attempt === 3 || !lostCreateRace(error)) throw error;
    }
  }
}

/**
 * Whether `error` says another run created the table first. Found by test
 * (`migrate.db.test.ts`, "several runs start together"): `42P07`, the
 * relation exists, or `23505` on one of Postgres's own catalog indexes,
 * such as `pg_class_relname_nsp_index` for the table or its id's sequence,
 * or `pg_type_typname_nsp_index` for the row type every table gets.
 */
function lostCreateRace(error: unknown): boolean {
  // Drizzle wraps the driver's error as its cause.
  const cause = error instanceof Error ? error.cause : undefined;
  if (!(cause instanceof postgres.PostgresError)) return false;
  return (
    cause.code === "42P07" ||
    (cause.code === "23505" &&
      cause.constraint_name?.startsWith("pg_") === true)
  );
}
