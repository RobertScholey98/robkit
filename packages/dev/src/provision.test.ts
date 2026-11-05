import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, describe, expect, inject, it } from "vitest";
import {
  databasePassword,
  databaseUrl,
  provisionApps,
  provisionDatabase,
  provisionDatabases,
} from "./provision.ts";

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
});

/**
 * An install with one app, `slug`, which migrates as `ledger` does and
 * holds `seed` as its seed.sql, if given. Each test takes its own slug, since
 * the seed runs only when the step first makes the app's schema.
 */
async function installWithSeed(slug: string, seed?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "robkit-seed-"));
  await cp(join(fixture, "migrate.js"), join(root, "migrate.js"));
  await cp(join(fixture, "package.json"), join(root, "package.json"));
  await mkdir(join(root, "apps", slug), { recursive: true });
  await writeFile(
    join(root, "apps", slug, "package.json"),
    JSON.stringify({
      name: slug,
      private: true,
      type: "module",
      scripts: { migrate: "node ../../migrate.js" },
    }),
  );
  if (seed !== undefined) await writeSeed(root, slug, seed);
  return root;
}

function writeSeed(root: string, slug: string, seed: string): Promise<void> {
  return writeFile(join(root, "apps", slug, "seed.sql"), seed);
}

async function entries(slug: string): Promise<unknown> {
  const admin = connect(adminUrl);
  return admin`select body from ${admin(slug)}.entry order by body`;
}

describe("provisionApps' seed", () => {
  it("runs an app's seed.sql once, as the app, after its first migration", async () => {
    const root = await installWithSeed(
      "guests",
      "insert into entry (body) values (current_user);\ninsert into entry (body) values ('second');\n",
    );

    await provisionApps(root, { adminUrl, env });
    await provisionApps(root, { adminUrl, env });

    expect(await entries("guests")).toEqual([
      { body: "guests" },
      { body: "migrated" },
      { body: "second" },
    ]);
  });

  it("never runs a seed the app gains after its schema was made", async () => {
    const root = await installWithSeed("lateseed");
    await provisionApps(root, { adminUrl, env });
    await writeSeed(root, "lateseed", "insert into entry values ('late');");

    await provisionApps(root, { adminUrl, env });

    expect(await entries("lateseed")).toEqual([{ body: "migrated" }]);
  });

  it("stops at a seed that fails, and runs it once it's fixed", async () => {
    const root = await installWithSeed(
      "badseed",
      "insert into entry values ('half');\ninsert into nowhere values (1);",
    );

    await expect(provisionApps(root, { adminUrl, env })).rejects.toThrow(
      'apps/badseed/seed.sql failed: relation "nowhere" does not exist',
    );
    expect(await entries("badseed")).toEqual([{ body: "migrated" }]);

    await writeSeed(root, "badseed", "insert into entry values ('fixed');");
    await provisionApps(root, { adminUrl, env });
    await provisionApps(root, { adminUrl, env });

    expect(await entries("badseed")).toEqual([
      { body: "fixed" },
      { body: "migrated" },
    ]);
  });

  it("keeps the seed to the app's own schema", async () => {
    await provisionDatabase(adminUrl, "seedtarget");
    const root = await installWithSeed(
      "seedsnoop",
      "create table seedtarget.planted (id int);",
    );

    await expect(provisionApps(root, { adminUrl, env })).rejects.toThrow(
      /apps\/seedsnoop\/seed\.sql failed: permission denied for schema seedtarget/,
    );
  });
});
