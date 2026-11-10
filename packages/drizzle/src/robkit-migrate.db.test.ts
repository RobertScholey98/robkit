import { execFile } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { robkitMigrate as robkitMigrateHere } from "./robkit-migrate.ts";
import { adminUrlFor, freshDatabase, query } from "./test/fresh-database.ts";

const run = promisify(execFile);

const command = fileURLToPath(
  new URL("robkit-migrate-command.ts", import.meta.url),
);
const fixtures = fileURLToPath(new URL("test/migrations", import.meta.url));

/** An app's folder, with the fixture migrations in `subfolder`. */
async function appFolder(subfolder: string): Promise<string> {
  const app = await mkdtemp(join(tmpdir(), "robkit-migrate-app-"));
  onTestFinished(() => rm(app, { recursive: true }));
  await cp(fixtures, join(app, subfolder), { recursive: true });
  return app;
}

/** Runs `robkit-migrate` in `cwd`, as an app's `migrate` script does. */
function robkitMigrate(
  args: string[],
  { cwd, databaseUrl }: { cwd: string; databaseUrl?: string },
) {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH };
  if (databaseUrl !== undefined) env.DATABASE_URL = databaseUrl;
  return run(process.execPath, [command, ...args], { cwd, env });
}

/** The tables the app's role owns in its schema. */
function tablesIn(databaseUrl: string) {
  return query(
    adminUrlFor(databaseUrl),
    `select tablename as name from pg_tables
     where schemaname = 'notes' order by tablename`,
  );
}

describe("robkit-migrate", () => {
  it("applies the migrations in the app's drizzle folder, then changes nothing on a second run", async () => {
    const databaseUrl = await freshDatabase();
    const app = await appFolder("drizzle");

    const first = await robkitMigrate([], { cwd: app, databaseUrl });
    const second = await robkitMigrate([], { cwd: app, databaseUrl });

    expect(first.stdout).toBe("migrated\n");
    expect(second.stdout).toBe("migrated\n");
    expect(await tablesIn(databaseUrl)).toEqual([
      { name: "__drizzle_migrations" },
      { name: "note" },
      { name: "tag" },
    ]);
    expect(await query(databaseUrl, "select body from note")).toEqual([
      { body: "first" },
    ]);
  });

  it("applies each migration once when two runs start together on a schema with no journal", async () => {
    const databaseUrl = await freshDatabase();
    const app = await appFolder("drizzle");

    const runs = await Promise.all([
      robkitMigrate([], { cwd: app, databaseUrl }),
      robkitMigrate([], { cwd: app, databaseUrl }),
    ]);

    expect(runs.map((done) => done.stdout)).toEqual([
      "migrated\n",
      "migrated\n",
    ]);
    expect(
      await query(
        databaseUrl,
        "select count(*)::int as runs from __drizzle_migrations",
      ),
    ).toEqual([{ runs: 2 }]);
    expect(await query(databaseUrl, "select body from note")).toEqual([
      { body: "first" },
    ]);
  });

  it("says it migrated and returns 0, in process", async () => {
    const databaseUrl = await freshDatabase();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    onTestFinished(() => {
      log.mockRestore();
    });

    expect(
      await robkitMigrateHere([fixtures], { DATABASE_URL: databaseUrl }),
    ).toBe(0);
    expect(log.mock.calls).toEqual([["migrated"]]);
    expect(await tablesIn(databaseUrl)).toHaveLength(3);
  });

  it("reads its migrations from the folder it is given", async () => {
    const databaseUrl = await freshDatabase();
    const app = await appFolder("db/migrations");

    await robkitMigrate(["db/migrations"], { cwd: app, databaseUrl });

    expect(await tablesIn(databaseUrl)).toEqual([
      { name: "__drizzle_migrations" },
      { name: "note" },
      { name: "tag" },
    ]);
  });

  it("prints the reader's message alone and exits 1 when DATABASE_URL isn't set", async () => {
    const app = await appFolder("drizzle");

    await expect(robkitMigrate([], { cwd: app })).rejects.toMatchObject({
      code: 1,
      stdout: "",
      stderr:
        "DATABASE_URL is not set. Run the app with pnpm dev, which sets it, or set it to a postgres:// URL.\n",
    });
  });
});
