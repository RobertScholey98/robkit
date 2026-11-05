import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { startPostgres, type TestPostgres } from "@internal/test-postgres";
import { provisionDatabase } from "@robkit/dev";
import { readyStacks, type Stack } from "create-robkit";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { addedSlug } from "./install.ts";

const run = promisify(execFile);

let database: TestPostgres;
let admin: postgres.Sql;
const folders: string[] = [];

beforeAll(async () => {
  database = await startPostgres();
  admin = postgres(database.adminUrl, { max: 1, onnotice: () => undefined });
});

afterAll(async () => {
  await admin.end();
  await database.stop();
  await Promise.all(
    folders.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

/** The app on `stack` in the default install: its example, or the one added. */
function appOn(stack: Stack): string {
  const slug = stack === "start" ? "example" : addedSlug;
  return join(inject("installs").start, "apps", slug);
}

/**
 * A copy of the migrate script and migrations of the app on `stack`, which
 * resolves its packages from the app's, with `seed` as its seed.sql if
 * given. A copy, since the journeys run the installs' apps meanwhile.
 */
async function appWithSeed(stack: Stack, seed?: string): Promise<string> {
  const app = appOn(stack);
  const dir = await mkdtemp(join(tmpdir(), "robkit-seed-"));
  folders.push(dir);
  await mkdir(join(dir, "src"));
  await cp(join(app, "src/migrate.ts"), join(dir, "src/migrate.ts"));
  await cp(join(app, "drizzle"), join(dir, "drizzle"), { recursive: true });
  await writeFile(join(dir, "package.json"), '{ "type": "module" }\n');
  await symlink(join(app, "node_modules"), join(dir, "node_modules"));
  if (seed !== undefined) await writeFile(join(dir, "seed.sql"), seed);
  return dir;
}

/** Runs the app's migrate script as `slug`, resolving with what it printed. */
async function migrate(
  dir: string,
  databaseUrl: string,
): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      [join(dir, "src/migrate.ts")],
      { env: { ...process.env, DATABASE_URL: databaseUrl } },
    );
    return { code: 0, output: stdout + stderr };
  } catch (error) {
    const { code, stdout, stderr } = error as {
      code: number;
      stdout: string;
      stderr: string;
    };
    return { code, output: stdout + stderr };
  }
}

async function visitors(slug: string): Promise<string[]> {
  const rows = await admin<{ viewer: string }[]>`
    select viewer from ${admin(slug)}.visit order by viewer`;
  return rows.map((row) => row.viewer);
}

// The provision step marks a schema it has just made, in pnpm dev and in
// production alike, and the app's own migrate script runs its seed.sql:
// the one step that runs after its migrations in both.
describe.each(readyStacks)("a %s app's migrate script", (stack) => {
  /** A slug of its own per test, since a seed runs only on a new schema. */
  const slugFor = (test: string) => `${test}${stack.replace("-", "")}`;

  it("runs the app's seed.sql once, as the app, after the migrations that first make its schema", async () => {
    const slug = slugFor("seeded");
    const dir = await appWithSeed(
      stack,
      "insert into visit (viewer) values (current_user);\ninsert into visit (viewer) values ('second');\n",
    );
    const databaseUrl = await provisionDatabase(database.adminUrl, slug);

    expect((await migrate(dir, databaseUrl)).code).toBe(0);
    expect((await migrate(dir, databaseUrl)).code).toBe(0);

    expect(await visitors(slug)).toEqual(["second", slug]);
  });

  it("never runs a seed the app gains after its schema was made", async () => {
    const slug = slugFor("lateseed");
    const dir = await appWithSeed(stack);
    const databaseUrl = await provisionDatabase(database.adminUrl, slug);
    await migrate(dir, databaseUrl);
    await writeFile(
      join(dir, "seed.sql"),
      "insert into visit (viewer) values ('late');",
    );

    expect((await migrate(dir, databaseUrl)).code).toBe(0);

    expect(await visitors(slug)).toEqual([]);
  });

  it("stops at a seed that fails, and runs it once it's fixed", async () => {
    const slug = slugFor("badseed");
    const dir = await appWithSeed(
      stack,
      "insert into visit (viewer) values ('half');\ninsert into nowhere values (1);",
    );
    const databaseUrl = await provisionDatabase(database.adminUrl, slug);

    const failed = await migrate(dir, databaseUrl);

    expect(failed.code).toBe(1);
    expect(failed.output).toContain(
      'seed.sql failed: relation "nowhere" does not exist',
    );
    expect(await visitors(slug)).toEqual([]);

    await writeFile(
      join(dir, "seed.sql"),
      "insert into visit (viewer) values ('fixed');",
    );
    await migrate(dir, databaseUrl);
    await migrate(dir, databaseUrl);

    expect(await visitors(slug)).toEqual(["fixed"]);
  });

  it("keeps the seed to the app's own schema", async () => {
    const target = slugFor("seedtarget");
    await provisionDatabase(database.adminUrl, target);
    const slug = slugFor("seedsnoop");
    const dir = await appWithSeed(
      stack,
      `create table ${target}.planted (id int);`,
    );
    const databaseUrl = await provisionDatabase(database.adminUrl, slug);

    const failed = await migrate(dir, databaseUrl);

    expect(failed.code).toBe(1);
    expect(failed.output).toContain(
      `seed.sql failed: permission denied for schema ${target}`,
    );
  });
});

it("gives the sample guestbook the migrate script of its stack", async () => {
  const read = (path: string) =>
    readFile(new URL(`../../../${path}`, import.meta.url), "utf8");

  expect(await read("examples/guestbook/src/migrate.ts")).toBe(
    await read(
      "packages/create-robkit/templates/stacks/react-hono/src/migrate.ts",
    ),
  );
});
