import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * The migrator every Node stack's `src/migrate.ts` held before this package,
 * with only its reading of `DATABASE_URL` and its folder taken out, so a
 * test can build the journal it wrote.
 */
export async function oldMigrate(
  databaseUrl: string,
  folder: string,
): Promise<void> {
  const migrations = readMigrationFiles({ migrationsFolder: folder });
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
}
