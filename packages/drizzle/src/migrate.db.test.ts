import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { migrate } from "./migrate.ts";
import { adminUrlFor, freshDatabase, query } from "./test/fresh-database.ts";
import { oldMigrate } from "./test/old-migrate.ts";

const folder = fileURLToPath(new URL("test/migrations", import.meta.url));
const firstMigration = fileURLToPath(
  new URL("test/first-migration", import.meta.url),
);

/** Each migration the journal in `schema` records, oldest first. */
function journal(databaseUrl: string, schema = "notes") {
  return query(
    adminUrlFor(databaseUrl),
    `select created_at::text as at from ${schema}.__drizzle_migrations order by id`,
  );
}

describe("migrate", () => {
  it("applies the migrations in the app's own schema, and records them there", async () => {
    const databaseUrl = await freshDatabase();

    await migrate({ databaseUrl, folder });

    expect(
      await query(
        adminUrlFor(databaseUrl),
        `select schemaname as schema, tablename as name from pg_tables
         where tableowner = 'notes' order by tablename`,
      ),
    ).toEqual([
      { schema: "notes", name: "__drizzle_migrations" },
      { schema: "notes", name: "note" },
      { schema: "notes", name: "tag" },
    ]);
    expect(await journal(databaseUrl)).toEqual([
      { at: "1761868800000" },
      { at: "1761955200000" },
    ]);
  });

  it("changes nothing on a second run", async () => {
    const databaseUrl = await freshDatabase();
    await migrate({ databaseUrl, folder });

    await migrate({ databaseUrl, folder });

    expect(await query(databaseUrl, "select body from note")).toEqual([
      { body: "first" },
    ]);
    expect(await journal(databaseUrl)).toHaveLength(2);
  });

  it("carries on from the journal the old src/migrate.ts wrote", async () => {
    const databaseUrl = await freshDatabase();
    await oldMigrate(databaseUrl, firstMigration);

    await migrate({ databaseUrl, folder });

    expect(await query(databaseUrl, "select body from note")).toEqual([
      { body: "first" },
    ]);
    expect(await query(databaseUrl, "select name from tag")).toEqual([]);
    expect(await journal(databaseUrl)).toEqual([
      { at: "1761868800000" },
      { at: "1761955200000" },
    ]);
  });

  it("keeps its journal in the schema it is given", async () => {
    const databaseUrl = await freshDatabase();
    await query(
      adminUrlFor(databaseUrl),
      "create schema elsewhere authorization notes",
    );

    await migrate({ databaseUrl, folder, schema: "elsewhere" });

    expect(await journal(databaseUrl, "elsewhere")).toHaveLength(2);
    expect(
      await query(
        adminUrlFor(databaseUrl),
        "select tablename from pg_tables where schemaname = 'notes' and tablename = '__drizzle_migrations'",
      ),
    ).toEqual([]);
  });

  it("says so when the role has no schema to keep its journal in", async () => {
    const databaseUrl = await freshDatabase();
    await query(adminUrlFor(databaseUrl), "drop schema notes");

    await expect(migrate({ databaseUrl, folder })).rejects.toThrow(
      `The database role notes has no schema on its search path (notes), so there is nowhere to keep the migrations' journal. Run the provision step, which makes the app's schema, then migrate again.`,
    );
  });

  it("applies each migration once when several runs start together on a schema with no journal", async () => {
    const databaseUrl = await freshDatabase();

    await Promise.all(
      Array.from({ length: 6 }, () => migrate({ databaseUrl, folder })),
    );

    expect(await journal(databaseUrl)).toEqual([
      { at: "1761868800000" },
      { at: "1761955200000" },
    ]);
    expect(await query(databaseUrl, "select body from note")).toEqual([
      { body: "first" },
    ]);
  });

  it("goes on when another run creates the journal while it is creating it", async () => {
    const databaseUrl = await freshDatabase();
    const other = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    const watcher = postgres(adminUrlFor(databaseUrl), { max: 1 });
    try {
      let migrating: Promise<void> | undefined;
      await other.begin(async (tx) => {
        await tx`create table __drizzle_migrations (
          id serial primary key, hash text not null, created_at bigint)`;
        migrating = migrate({ databaseUrl, folder });
        // Its create now waits on the other run's, which Postgres refuses
        // once the other commits.
        await expect.poll(() => waitingOnALock(watcher)).toBe(1);
      });
      await migrating;
    } finally {
      await other.end();
      await watcher.end();
    }
    expect(await journal(databaseUrl)).toHaveLength(2);
  });

  it("fails with Postgres's own error when it can't create its journal", async () => {
    const databaseUrl = await freshDatabase();
    // An enum of the journal's name stops the table being made, since a
    // table's row type takes its name, and no other run made the table.
    await query(
      databaseUrl,
      "create type __drizzle_migrations as enum ('taken')",
    );

    await expect(migrate({ databaseUrl, folder })).rejects.toMatchObject({
      cause: { code: "42710" },
    });
  });

  it("waits on its journal table, holding no advisory lock", async () => {
    const databaseUrl = await freshDatabase();
    await migrate({ databaseUrl, folder: firstMigration });
    const holder = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    // A superuser in the same database sees every session's locks.
    const watcher = postgres(adminUrlFor(databaseUrl), { max: 1 });
    try {
      let migrating: Promise<void> | undefined;
      await holder.begin(async (tx) => {
        await tx`lock table __drizzle_migrations in access exclusive mode`;
        migrating = migrate({ databaseUrl, folder });
        // The migrator is now queued behind the holder's lock.
        await expect.poll(() => waitingOnTheJournal(watcher)).toBe(1);

        expect(
          await watcher`select count(*)::int as n from pg_locks where locktype = 'advisory'`,
        ).toEqual([{ n: 0 }]);
      });
      await migrating;
    } finally {
      await holder.end();
      await watcher.end();
    }
    expect(await journal(databaseUrl)).toHaveLength(2);
  });
});

/** How many sessions in the watcher's database wait for any lock. */
async function waitingOnALock(watcher: postgres.Sql): Promise<number> {
  const [row] = await watcher<{ n: number }[]>`
    select count(*)::int as n from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock'`;
  return row?.n ?? 0;
}

/** How many sessions wait for a lock on the app's journal table. */
async function waitingOnTheJournal(watcher: postgres.Sql): Promise<number> {
  const [row] = await watcher<{ n: number }[]>`
    select count(*)::int as n from pg_locks
    where not granted and relation = 'notes.__drizzle_migrations'::regclass`;
  return row?.n ?? 0;
}
