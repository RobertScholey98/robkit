import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
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
 * missing both try to create it, and Postgres refuses the later one. Which
 * error it gives depends on how far the first had got: `42P07` for the
 * table, `42710` for the row type every table gets, or `23505` on one of
 * its own catalog indexes. The refused run doesn't sort them. Postgres
 * gives each only once the first run has committed, so it looks for the
 * table, and goes on if it is there.
 */
async function createJournal(db: Database): Promise<void> {
  try {
    await db.execute(sql`
      create table if not exists core.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )`);
  } catch (error) {
    // pg_tables, not to_regclass, which would also find a type or a view
    // of that name.
    const [journal] = await db.execute<{ made: boolean }>(sql`
      select exists (
        select from pg_tables
        where schemaname = 'core' and tablename = '__drizzle_migrations'
      ) as made`);
    if (journal?.made !== true) throw error;
  }
}
