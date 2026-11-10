import { sql, type SQL } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export interface MigrateOptions {
  /** Connects as the role that owns the schema, such as an app's own. */
  databaseUrl: string;
  /** The folder drizzle-kit wrote the migrations to: `out` in `drizzle.config.ts`. */
  folder: string;
  /**
   * The schema that holds the journal table. By default it is the first on
   * the role's search path, which for an app's role is the app's own.
   */
  schema?: string;
}

/**
 * Applies the Drizzle migrations in `folder` that haven't run.
 *
 * It follows Drizzle's own Postgres migrator and keeps its journal table,
 * `__drizzle_migrations`, but in the role's schema, and it skips the
 * migrator's first statement. That is `CREATE SCHEMA IF NOT EXISTS`, which
 * Postgres refuses to a role without CREATE on the database even when the
 * schema exists, and the provision step has already made the schema.
 *
 * Two runs can start together, as two containers of one app do. Each locks
 * the journal table inside the transaction that migrates, so the second
 * waits for the first to commit and then finds nothing left to apply. It
 * takes no advisory lock: any role in the shared database can take any
 * advisory key, but only the schema's own role can lock its table.
 */
export async function migrate({
  databaseUrl,
  folder,
  schema,
}: MigrateOptions): Promise<void> {
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  const db = drizzle({ client });
  try {
    const inSchema = schema ?? (await firstSchema(db));
    const journal = sql`${sql.identifier(inSchema)}.__drizzle_migrations`;
    await createJournal(db, inSchema, journal);
    await db.transaction(async (tx) => {
      await tx.execute(sql`lock table ${journal} in exclusive mode`);
      const [last] = await tx.execute<{ created_at: string }>(
        sql`select created_at from ${journal} order by created_at desc limit 1`,
      );
      for (const migration of migrations) {
        if (last && Number(last.created_at) >= migration.folderMillis) continue;
        for (const statement of migration.sql) {
          await tx.execute(sql.raw(statement));
        }
        await tx.execute(
          sql`insert into ${journal} (hash, created_at) values (${migration.hash}, ${migration.folderMillis})`,
        );
      }
    });
  } finally {
    await client.end();
  }
}

/**
 * The first schema on the role's search path that exists: where a table
 * named without a schema lands, and where the old `src/migrate.ts` of each
 * Node stack kept its journal.
 */
async function firstSchema(db: PostgresJsDatabase): Promise<string> {
  const [row] = await db.execute<{
    schema: string | null;
    role: string;
    path: string;
  }>(sql`
    select current_schema() as schema, current_user as role,
      current_setting('search_path') as path`);
  if (row?.schema == null) {
    throw new Error(
      `The database role ${row?.role ?? "in DATABASE_URL"} has no schema on its search path (${row?.path ?? "unknown"}), so there is nowhere to keep the migrations' journal. Run the provision step, which makes the app's schema, then migrate again.`,
    );
  }
  return row.schema;
}

/**
 * Creates the journal table unless it exists. Two runs that both find it
 * missing both try to create it, and Postgres refuses the later one. Which
 * error it gives depends on how far the first had got: `42P07` for the
 * table, `42710` for the row type every table gets, or `23505` on one of
 * its own catalog indexes. The refused run doesn't sort them. Postgres
 * gives each only once the first run has committed, so it looks for the
 * table, and goes on if it is there.
 */
async function createJournal(
  db: PostgresJsDatabase,
  schema: string,
  journal: SQL,
): Promise<void> {
  try {
    await db.execute(sql`
      create table if not exists ${journal} (
        id serial primary key,
        hash text not null,
        created_at bigint
      )`);
  } catch (error) {
    // pg_tables, not to_regclass, which would also find a type or a view
    // of that name.
    const [found] = await db.execute<{ made: boolean }>(sql`
      select exists (
        select from pg_tables
        where schemaname = ${schema} and tablename = '__drizzle_migrations'
      ) as made`);
    if (found?.made !== true) throw error;
  }
}
