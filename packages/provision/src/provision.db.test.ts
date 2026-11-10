import postgres from "postgres";
import { afterAll, describe, expect, inject, it } from "vitest";
import {
  databasePassword,
  databaseUrl,
  provisionDatabase,
  provisionDatabases,
} from "./provision.ts";
import { slug } from "@internal/test-session";
import type { Slug } from "@robkit/input";

const adminUrl = inject("adminUrl");
const clients: postgres.Sql[] = [];

afterAll(async () => {
  await Promise.all(clients.map((sql) => sql.end()));
});

function connect(url: string): postgres.Sql {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  clients.push(sql);
  return sql;
}

/** The app's `DATABASE_URL`, failing the test if provisioning refused it. */
async function provisioned(name: Slug, password?: string): Promise<string> {
  const result = await provisionDatabase(adminUrl, name, password);
  if (result.outcome !== "provisioned") throw new Error(result.error);
  return result.databaseUrl;
}

/** The derived password, failing the test if the secret is too short. */
function passwordOf(secret: string, name: Slug): string {
  const result = databasePassword(secret, name);
  if (result.outcome !== "derived") throw new Error(result.error);
  return result.password;
}

/** The roles named `names`, and whether each is a superuser. */
async function roles(names: string[]): Promise<unknown[]> {
  const admin = connect(adminUrl);
  return [
    ...(await admin`
      select rolname, rolsuper from pg_roles
      where rolname in ${admin(names)} order by rolname`),
  ];
}

describe("provisionDatabase", () => {
  it("gives the app a schema it can create and read tables in", async () => {
    const app = connect(await provisioned(slug("notes")));

    await app`create table note (body text)`;
    await app`insert into note values ('hi')`;

    expect(await app`select body from notes.note`).toEqual([{ body: "hi" }]);
  });

  it("keeps the app out of the public schema", async () => {
    const app = connect(await provisioned(slug("publicprobe")));

    await expect(app`create table public.leak (id int)`).rejects.toThrow(
      /permission denied for schema public/,
    );
  });

  it("keeps the app out of another app's schema", async () => {
    const owner = connect(await provisioned(slug("diary")));
    const other = connect(await provisioned(slug("snoop")));
    await owner`create table secret (body text)`;

    await expect(other`select * from diary.secret`).rejects.toThrow(
      /permission denied for schema diary/,
    );
  });

  it("keeps the example app out of core's schema", async () => {
    const core = connect(await provisioned(slug("core")));
    const example = connect(await provisioned(slug("example")));
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
    const app = connect(await provisioned(slug("schemer")));

    await expect(app`create schema extra`).rejects.toThrow(
      /permission denied for database/,
    );
  });

  it("converges when run again, keeping the app's tables", async () => {
    const first = connect(await provisioned(slug("rerun")));
    await first`create table kept (id int)`;
    await first.end();

    const again = connect(await provisioned(slug("rerun")));

    expect(await again`select count(*)::int as n from kept`).toEqual([
      { n: 0 },
    ]);
  });

  // The password goes into DDL, which takes no parameter. robkit's own
  // callers pass hex, but the argument is anyone's to give.
  it("takes a password with a quote and a backslash in it, as written", async () => {
    const password = `it's \\' "odd"; drop role postgres --`;

    const app = connect(await provisioned(slug("quoted"), password));

    expect(await app`select current_user as name`).toEqual([
      { name: "quoted" },
    ]);
  });

  it("refuses a name that can't be a slug", async () => {
    expect(
      // @ts-expect-error Only readSlug makes a Slug.
      await provisionDatabase(adminUrl, "drop table x;--"),
    ).toEqual({
      outcome: "not-a-slug",
      slug: "drop table x;--",
      error: `"drop table x;--" can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.`,
    });
  });

  it("throws what went wrong when it can't reach the database", async () => {
    const nowhere = "postgres://postgres:postgres@127.0.0.1:1/robkit";

    await expect(provisionDatabase(nowhere, slug("unreached"))).rejects.toThrow(
      "The provision step couldn't give unreached its database (attempt 1 of 10).",
    );
  });

  it("refuses an existing superuser's name, and leaves it a superuser", async () => {
    const admin = connect(adminUrl);
    await admin`create role chief superuser`;

    expect(await provisionDatabase(adminUrl, slug("chief"))).toEqual({
      outcome: "superuser",
      slug: "chief",
      error: `"chief" is a superuser in the install's database, so the provision step won't make it an app's role.`,
    });
    expect(await roles(["chief"])).toEqual([
      { rolname: "chief", rolsuper: true },
    ]);
  });

  it("refuses the name of the role it connects as, and leaves that role alone", async () => {
    const admin = connect(adminUrl);
    await admin`create role keeper login superuser password 'keeper'`;
    const asKeeper = new URL(adminUrl);
    asKeeper.username = "keeper";
    asKeeper.password = "keeper";

    expect(await provisionDatabase(asKeeper.href, slug("keeper"))).toEqual({
      outcome: "own-role",
      slug: "keeper",
      error: `"keeper" is the role the provision step connects as, so it can't also be an app's role.`,
    });
    expect(await roles(["keeper"])).toEqual([
      { rolname: "keeper", rolsuper: true },
    ]);
  });
});

const secret = "correct horse battery staple, 32+";

describe("databasePassword", () => {
  it("is the HMAC of the slug under the install's secret", () => {
    expect(databasePassword(secret, slug("notes"))).toEqual({
      outcome: "derived",
      password:
        "5c693a1b5df2ff9abbcbe9142b079cd6e490c362f4f7876cc89f696705028a96",
    });
  });

  it("refuses a secret shorter than 32 characters", () => {
    expect(databasePassword("short", slug("notes"))).toEqual({
      outcome: "short-secret",
      error: "The database secret is 5 characters. It must be at least 32.",
    });
  });
});

describe("provisionDatabases", () => {
  it("gives each app a role whose password comes from the secret", async () => {
    const result = await provisionDatabases({
      adminUrl,
      secret,
      slugs: [slug("derived"), slug("derivedtoo")],
    });

    expect(result.outcome).toBe("provisioned");
    const urls = result.outcome === "provisioned" ? result.databaseUrls : null;
    expect([...(urls?.keys() ?? [])]).toEqual(["derived", "derivedtoo"]);
    for (const name of [slug("derived"), slug("derivedtoo")]) {
      const url = databaseUrl(adminUrl, name, passwordOf(secret, name));
      expect(urls?.get(name)).toBe(url);
      const app = connect(url);
      expect(await app`select current_user as role`).toEqual([{ role: name }]);
    }
  });

  it("leaves every app's URL working when run again", async () => {
    const url = databaseUrl(
      adminUrl,
      slug("steady"),
      passwordOf(secret, slug("steady")),
    );
    await provisionDatabases({ adminUrl, secret, slugs: [slug("steady")] });
    const first = connect(url);
    await first`create table kept (id int)`;
    await first.end();

    await provisionDatabases({ adminUrl, secret, slugs: [slug("steady")] });

    const again = connect(url);
    expect(await again`select count(*)::int as n from kept`).toEqual([
      { n: 0 },
    ]);
  });

  it("refuses a short secret before it touches any role", async () => {
    expect(
      await provisionDatabases({
        adminUrl,
        secret: "short",
        slugs: [slug("untouched")],
      }),
    ).toEqual({
      outcome: "short-secret",
      error: "The database secret is 5 characters. It must be at least 32.",
    });
    expect(await roles(["untouched"])).toEqual([]);
  });

  it("stops at the first app it refuses, and says which", async () => {
    const admin = connect(adminUrl);
    await admin`create role boss superuser`;

    expect(
      await provisionDatabases({
        adminUrl,
        secret,
        slugs: [slug("boss"), slug("afterboss")],
      }),
    ).toMatchObject({ outcome: "superuser", slug: "boss" });
    expect(await roles(["afterboss"])).toEqual([]);
  });

  it("waits on Postgres's own locks, holding no advisory lock", async () => {
    const holder = postgres(adminUrl, { max: 1, onnotice: () => undefined });
    const watcher = connect(adminUrl);
    try {
      let provisioning: Promise<unknown> | undefined;
      await holder
        .begin(async (tx) => {
          // Another run that is making the same role, and hasn't committed.
          await tx`create role lockprobe`;
          provisioning = provisionDatabases({
            adminUrl,
            secret,
            slugs: [slug("lockprobe")],
          });
          await expect
            .poll(
              async () =>
                (
                  await watcher<{ n: number }[]>`
                    select count(*)::int as n from pg_locks where not granted`
                )[0]?.n,
            )
            .toBe(1);

          expect(
            await watcher`select count(*)::int as n from pg_locks where locktype = 'advisory'`,
          ).toEqual([{ n: 0 }]);
          throw new Error("roll back");
        })
        .catch((error: unknown) => {
          // The holder rolls back on purpose, so the step can go on.
          if (!(error instanceof Error && error.message === "roll back")) {
            throw error;
          }
        });

      expect(await provisioning).toMatchObject({ outcome: "provisioned" });
    } finally {
      await holder.end();
    }
  });

  // Two cores can start together, as in a rolling deploy. The one that
  // loses a race to create a role or a schema, or to change who may reach
  // them, tries that app again.
  it.each([1, 2, 3])(
    "gives every app its database when several runs start together (round %i)",
    async (round) => {
      const slugs = ["racea", "raceb", "racec"].map((name) =>
        slug(`${name}${String(round)}`),
      );

      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          provisionDatabases({ adminUrl, secret, slugs }),
        ),
      );

      expect(results.map((result) => result.outcome)).toEqual(
        Array(6).fill("provisioned"),
      );
      for (const name of slugs) {
        const app = connect(
          databaseUrl(adminUrl, name, passwordOf(secret, name)),
        );
        expect(await app`select current_schema() as schema`).toEqual([
          { schema: name },
        ]);
      }
    },
  );
});
