import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import postgres from "postgres";
import { afterAll, describe, expect, inject, it, vi } from "vitest";
import {
  databasePassword,
  databaseUrl,
  provisionApps,
  provisionDatabase,
  provisionDatabases,
} from "./provision.ts";

const run = promisify(execFile);
const adminUrl = inject("adminUrl");
const clients: postgres.Sql[] = [];
const fixture = fileURLToPath(
  new URL("test/provision-install", import.meta.url),
);

afterAll(async () => {
  await Promise.all(clients.map((sql) => sql.end()));
});

function connect(url: string): postgres.Sql {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  clients.push(sql);
  return sql;
}

describe("provisionDatabase", () => {
  it("gives the app a schema it can create and read tables in", async () => {
    const app = connect(await provisionDatabase(adminUrl, "notes"));

    await app`create table note (body text)`;
    await app`insert into note values ('hi')`;

    expect(await app`select body from notes.note`).toEqual([{ body: "hi" }]);
  });

  it("keeps the app out of the public schema", async () => {
    const app = connect(await provisionDatabase(adminUrl, "publicprobe"));

    await expect(app`create table public.leak (id int)`).rejects.toThrow(
      /permission denied for schema public/,
    );
  });

  it("keeps the app out of another app's schema", async () => {
    const owner = connect(await provisionDatabase(adminUrl, "diary"));
    const other = connect(await provisionDatabase(adminUrl, "snoop"));
    await owner`create table secret (body text)`;

    await expect(other`select * from diary.secret`).rejects.toThrow(
      /permission denied for schema diary/,
    );
  });

  it("keeps the example app out of core's schema", async () => {
    const core = connect(await provisionDatabase(adminUrl, "core"));
    const example = connect(await provisionDatabase(adminUrl, "example"));
    await core`create table owner (username text)`;
    await core`insert into owner values ('rob')`;

    await expect(example`select * from core.owner`).rejects.toThrow(
      /permission denied for schema core/,
    );
    expect(await core`select username from core.owner`).toEqual([
      { username: "rob" },
    ]);
  });

  it("stops the app creating schemas", async () => {
    const app = connect(await provisionDatabase(adminUrl, "schemer"));

    await expect(app`create schema extra`).rejects.toThrow(
      /permission denied for database/,
    );
  });

  it("converges when run again, keeping the app's tables", async () => {
    const first = connect(await provisionDatabase(adminUrl, "rerun"));
    await first`create table kept (id int)`;
    await first.end();

    const again = connect(await provisionDatabase(adminUrl, "rerun"));

    expect(await again`select count(*)::int as n from kept`).toEqual([
      { n: 0 },
    ]);
  });

  it("refuses a name that can't be a slug", async () => {
    await expect(
      provisionDatabase(adminUrl, "drop table x;--"),
    ).rejects.toThrow(/can't be an app's slug/);
  });
});

const secret = "correct horse battery staple, 32+";

describe("databasePassword", () => {
  it("is the HMAC of the slug under the install's secret", () => {
    expect(databasePassword(secret, "notes")).toBe(
      "5c693a1b5df2ff9abbcbe9142b079cd6e490c362f4f7876cc89f696705028a96",
    );
  });

  it("refuses a secret shorter than 32 characters", () => {
    expect(() => databasePassword("short", "notes")).toThrow(
      "The database secret must be at least 32 characters.",
    );
  });
});

describe("provisionDatabases", () => {
  it("gives each app a role whose password comes from the secret", async () => {
    const urls = await provisionDatabases({
      adminUrl,
      secret,
      slugs: ["derived", "derivedtoo"],
    });

    expect([...urls.keys()]).toEqual(["derived", "derivedtoo"]);
    for (const slug of ["derived", "derivedtoo"]) {
      const url = databaseUrl(adminUrl, slug, databasePassword(secret, slug));
      expect(urls.get(slug)).toBe(url);
      const app = connect(url);
      expect(await app`select current_user as role`).toEqual([{ role: slug }]);
    }
  });

  it("leaves every app's URL working when run again", async () => {
    await provisionDatabases({ adminUrl, secret, slugs: ["steady"] });
    const first = connect(
      databaseUrl(adminUrl, "steady", databasePassword(secret, "steady")),
    );
    await first`create table kept (id int)`;
    await first.end();

    await provisionDatabases({ adminUrl, secret, slugs: ["steady"] });

    const again = connect(
      databaseUrl(adminUrl, "steady", databasePassword(secret, "steady")),
    );
    expect(await again`select count(*)::int as n from kept`).toEqual([
      { n: 0 },
    ]);
  });
});

/** A fresh copy of an install with `ledger`, which migrates, and `brochure`, which has no database. */
async function install(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "robkit-provision-"));
  await cp(fixture, root, { recursive: true });
  return root;
}

const env = {
  ...process.env,
  FIXTURE_POSTGRES: import.meta.resolve("postgres"),
};

/** What provisioning controls: the apps' roles, schemas and tables, and who may connect. */
async function catalog(): Promise<unknown> {
  const admin = connect(adminUrl);
  const slugs = ["ledger", "brochure"];
  return {
    roles: await admin`
      select rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin, rolconfig
      from pg_roles where rolname in ${admin(slugs)} order by rolname`,
    schemas: await admin`
      select nspname, pg_get_userbyid(nspowner) as owner, nspacl::text as acl
      from pg_namespace where nspname in ${admin(["ledger", "brochure", "public"])}
      order by nspname`,
    database: await admin`
      select datacl::text as acl from pg_database
      where datname = current_database()`,
    tables: await admin`
      select table_schema, table_name from information_schema.tables
      where table_schema in ${admin(slugs)} order by table_name`,
    entries: await admin`select body from ledger.entry`,
  };
}

describe("provisionApps", () => {
  it("gives each app with a migrate script its database, then migrates it", async () => {
    const databaseUrls = await provisionApps(await install(), {
      adminUrl,
      env,
    });

    expect([...databaseUrls.keys()]).toEqual(["ledger"]);
    const ledger = connect(databaseUrls.get("ledger") ?? "");
    expect(await ledger`select body from ledger.entry`).toEqual([
      { body: "migrated" },
    ]);
  });

  it("changes nothing when run again", async () => {
    const root = await install();
    await provisionApps(root, { adminUrl, env });
    const before = await catalog();

    await provisionApps(root, { adminUrl, env });

    expect(await catalog()).toEqual(before);
  });

  it("stops at the first migrate script that fails", async () => {
    await expect(
      provisionApps(await install(), {
        adminUrl,
        env: { ...env, FIXTURE_POSTGRES: "no-such-module" },
      }),
    ).rejects.toThrow(/pnpm run migrate exited with 1/);
  });

  it("starts no app's provisioning once its signal aborts", async () => {
    const databaseUrls = await provisionApps(await install(), {
      adminUrl,
      env,
      signal: AbortSignal.abort(),
    });

    expect(databaseUrls.size).toBe(0);
  });

  it("runs a new app's seed once, as the app, after its migrations", async () => {
    const root = await install();
    await seeded(
      root,
      "seeds",
      "insert into entry values ('seeded by ' || current_user);",
    );

    await provisionApps(root, { adminUrl, env });
    await provisionApps(root, { adminUrl, env });

    expect(await entries("seeds")).toEqual([
      { body: "migrated" },
      { body: "seeded by seeds" },
    ]);
  });

  it("says when it runs a seed", async () => {
    const root = await install();
    await seeded(root, "chatty", "insert into entry values ('seeded');");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    let said: unknown[][];
    try {
      await provisionApps(root, { adminUrl, env });
    } finally {
      said = [...log.mock.calls];
      log.mockRestore();
    }

    expect(said).toContainEqual([
      "[chatty] ran seed.sql once, on its new schema",
    ]);
  });

  it("never seeds an app whose schema was already there", async () => {
    const root = await install();
    await seeded(root, "lateseed", undefined);
    await provisionApps(root, { adminUrl, env });

    await seeded(root, "lateseed", "insert into entry values ('seeded');");
    await provisionApps(root, { adminUrl, env });

    expect(await entries("lateseed")).toEqual([{ body: "migrated" }]);
  });

  it("seeds on the next run when the first one failed to migrate", async () => {
    const root = await install();
    await seeded(root, "retried", "insert into entry values ('seeded');");
    await expect(
      provisionApps(root, {
        adminUrl,
        env: { ...env, FIXTURE_POSTGRES: "no-such-module" },
      }),
    ).rejects.toThrow(/pnpm run migrate exited with 1/);

    await provisionApps(root, { adminUrl, env });

    expect(await entries("retried")).toEqual([
      { body: "migrated" },
      { body: "seeded" },
    ]);
  });

  it("stops at a seed that fails, keeps none of it, and tries it again next time", async () => {
    const root = await install();
    await seeded(
      root,
      "badseed",
      "insert into entry values ('half'); insert into nowhere values (1);",
    );

    await expect(provisionApps(root, { adminUrl, env })).rejects.toThrow(
      'apps/badseed: its seed, seed.sql, failed: relation "nowhere" does not exist',
    );
    expect(await entries("badseed")).toEqual([{ body: "migrated" }]);

    await seeded(root, "badseed", "insert into entry values ('fixed');");
    await provisionApps(root, { adminUrl, env });
    expect(await entries("badseed")).toEqual([
      { body: "migrated" },
      { body: "fixed" },
    ]);
  });
});

describe("robkit-seed", () => {
  const bin = fileURLToPath(new URL("seed-bin.ts", import.meta.url));

  it("seeds the schema production's provision step made, once, as the app's container starts", async () => {
    const root = await install();
    await seeded(
      root,
      "hosted",
      "insert into entry values ('seeded by ' || current_user);",
    );
    const urls = await provisionDatabases({
      adminUrl,
      secret,
      slugs: ["hosted"],
    });
    const container = {
      cwd: join(root, "apps", "hosted"),
      env: {
        ...env,
        ROBKIT_APP: "hosted",
        DATABASE_URL: urls.get("hosted") ?? "",
      },
    };
    // As the stacks' start script does: migrate, then seed, every start.
    const start = async () => {
      await run("node", ["../../migrate.js"], container);
      return (await run("node", [bin], container)).stdout;
    };

    const said = [await start(), await start()];

    expect(said).toEqual(["ran seed.sql once, on its new schema\n", ""]);
    expect(await entries("hosted")).toEqual([
      { body: "migrated" },
      { body: "seeded by hosted" },
    ]);
  });
});

/**
 * Adds an app at `apps/<slug>` to the install at `root` that migrates as
 * ledger does, with `seed` as its `seed.sql` when given.
 */
async function seeded(root: string, slug: string, seed: string | undefined) {
  const dir = join(root, "apps", slug);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: slug,
      private: true,
      type: "module",
      scripts: { migrate: "node ../../migrate.js" },
    }),
  );
  if (seed !== undefined) await writeFile(join(dir, "seed.sql"), seed);
}

/** The rows in an app's `entry` table, in the order they went in. */
function entries(slug: string): Promise<unknown> {
  const admin = connect(adminUrl);
  return admin.unsafe(`select body from "${slug}".entry order by ctid`);
}
