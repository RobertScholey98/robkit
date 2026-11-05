import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const migrations = readMigrationFiles({
  migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
});

/**
 * What robkit's provision step comments on a schema it has just made, in
 * pnpm dev and in production alike, until the app's seed has run.
 */
const seedPending = "robkit: seed pending";

/** The app's seed.sql, if it has one. */
async function readSeed(): Promise<string | undefined> {
  try {
    return await readFile(new URL("../seed.sql", import.meta.url), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

// This follows Drizzle's own migrator and keeps the same journal table, but
// in the app's schema, and skips the migrator's CREATE SCHEMA. Postgres
// refuses that to the app's role, which can create nothing outside its own
// schema, even when the schema exists. Names without a schema land in the
// app's schema, which is first on its role's search path.
const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
const db = drizzle({ client });
try {
  await db.execute(sql`
    create table if not exists __drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )`);
  await db.transaction(async (tx) => {
    const [last] = await tx.execute<{ created_at: string }>(
      sql`select created_at from __drizzle_migrations order by created_at desc limit 1`,
    );
    for (const migration of migrations) {
      if (last && Number(last.created_at) >= migration.folderMillis) continue;
      for (const statement of migration.sql) {
        await tx.execute(sql.raw(statement));
      }
      await tx.execute(
        sql`insert into __drizzle_migrations (hash, created_at) values (${migration.hash}, ${migration.folderMillis})`,
      );
    }
  });

  // A schema the provision step has just made waits for its seed. The seed
  // runs once, as the app, and clears the mark in the same transaction, so
  // a seed that fails runs again next time. A schema with no seed.sql is
  // cleared too, so a seed the app gains later never runs.
  const seed = await readSeed();
  try {
    await client.begin(async (tx) => {
      const [schema] = await tx<{ name: string; note: string | null }[]>`
        select nspname as name, obj_description(oid, 'pg_namespace') as note
        from pg_namespace where nspname = current_schema()`;
      if (schema?.note !== seedPending) return;
      if (seed !== undefined) await tx.unsafe(seed);
      await tx`comment on schema ${tx(schema.name)} is null`;
    });
  } catch (error) {
    throw new Error(
      `seed.sql failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
} finally {
  await client.end();
}
console.log("migrated");
