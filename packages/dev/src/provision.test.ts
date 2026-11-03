import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, describe, expect, inject, it } from "vitest";
import { provisionApps, provisionDatabase } from "./provision.ts";

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
