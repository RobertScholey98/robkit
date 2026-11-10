import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { startPostgres, type TestPostgres } from "@internal/test-postgres";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const run = promisify(execFile);

let database: TestPostgres;
let server = "";
let built = "";

/** The URL `url` gives, in the database `name`, as `user`. */
function inDatabase(url: string, name: string, user?: string): string {
  const next = new URL(url);
  next.pathname = `/${name}`;
  if (user !== undefined) {
    next.username = user;
    next.password = user;
  }
  return next.href;
}

/** Runs `statement` at `url`. */
async function execute(url: string, statement: string): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  await sql.unsafe(statement).finally(() => sql.end());
}

/**
 * A fresh database holding the example's schema, as the provision step
 * leaves it.
 *
 * @returns the example's `DATABASE_URL` for it
 */
async function freshDatabase(): Promise<string> {
  const name = `example_${randomBytes(6).toString("hex")}`;
  await execute(database.adminUrl, `create database ${name}`);
  await execute(
    inDatabase(database.adminUrl, name),
    "create schema example authorization example",
  );
  return inDatabase(database.adminUrl, name, "example");
}

/** Runs the Go example's server with `migrate`, as its start script does. */
function migrate(databaseUrl: string) {
  return run(server, ["migrate"], {
    env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl },
  });
}

// The Go example's migrator, built from the go install, against its own
// Postgres.
describe("the Go example's migrator", () => {
  beforeAll(async () => {
    database = await startPostgres();
    await execute(
      database.adminUrl,
      "create role example login password 'example'; alter role example set search_path = example",
    );
    built = await mkdtemp(join(tmpdir(), "robkit-go-migrate-"));
    server = join(built, "server");
    await run("go", ["build", "-o", server, "."], {
      cwd: join(inject("checkInstalls").go, "apps", "example"),
    });
  }, 300_000);

  afterAll(async () => {
    await rm(built, { recursive: true, force: true });
    await database.stop();
  });

  it("goes on when another run creates its journal while it is creating it", async () => {
    const databaseUrl = await freshDatabase();
    const other = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    const watcher = postgres(
      inDatabase(database.adminUrl, new URL(databaseUrl).pathname.slice(1)),
      { max: 1 },
    );
    try {
      let migrating: ReturnType<typeof migrate> | undefined;
      await other.begin(async (tx) => {
        await tx`create table schema_migrations (
          name text primary key, applied_at timestamptz not null default now())`;
        migrating = migrate(databaseUrl);
        // Its create now waits on the other run's, which Postgres refuses
        // once the other commits.
        await expect
          .poll(
            async () => {
              const [row] = await watcher<{ n: number }[]>`
                select count(*)::int as n from pg_stat_activity
                where datname = current_database() and wait_event_type = 'Lock'`;
              return row?.n;
            },
            { timeout: 30_000 },
          )
          .toBe(1);
      });

      expect((await migrating)?.stdout).toBe("migrated\n");
    } finally {
      await other.end();
      await watcher.end();
    }
  });

  it("fails with Postgres's own error when it can't create its journal", async () => {
    const databaseUrl = await freshDatabase();
    // An enum of the journal's name stops the table being made, since a
    // table's row type takes its name, and no other run made the table.
    await execute(
      databaseUrl,
      "create type schema_migrations as enum ('taken')",
    );

    await expect(migrate(databaseUrl)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("(SQLSTATE 42710)") as unknown,
    });
  });
});
