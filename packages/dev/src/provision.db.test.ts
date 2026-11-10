import { cp, mkdtemp, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, describe, expect, inject, it } from "vitest";
import { CommandProblem } from "@robkit/input/command";
import { provisionApps } from "./provision.ts";
import { slug } from "@internal/test-session";

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
    const ledger = connect(databaseUrls.get(slug("ledger")) ?? "");
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

  it("stops with a message naming an app whose name is a superuser's", async () => {
    const root = await install();
    await rename(join(root, "apps/ledger"), join(root, "apps/overseer"));
    await connect(adminUrl)`create role overseer superuser`;

    await expect(provisionApps(root, { adminUrl, env })).rejects.toEqual(
      new CommandProblem(
        `pnpm dev can't give overseer its database. "overseer" is a superuser in the install's database, so the provision step won't make it an app's role. Rename apps/overseer.`,
      ),
    );
  });
});
