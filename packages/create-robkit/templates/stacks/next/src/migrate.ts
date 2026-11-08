import { fileURLToPath } from "node:url";
import { orExit, readDatabaseUrl } from "@robkit/input";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const databaseUrl = orExit(readDatabaseUrl(process.env));

const migrations = readMigrationFiles({
  migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
});

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
} finally {
  await client.end();
}
console.log("migrated");
