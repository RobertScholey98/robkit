import postgres from "postgres";
import { afterAll, describe, expect, inject, it } from "vitest";
import {
  databasePassword,
  databaseUrl,
  provisionDatabase,
  provisionDatabases,
} from "./provision.ts";
import { slug } from "@internal/test-session";

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

describe("provisionDatabase", () => {
  it("gives the app a schema it can create and read tables in", async () => {
    const app = connect(await provisionDatabase(adminUrl, slug("notes")));

    await app`create table note (body text)`;
    await app`insert into note values ('hi')`;

    expect(await app`select body from notes.note`).toEqual([{ body: "hi" }]);
  });

  it("keeps the app out of the public schema", async () => {
    const app = connect(await provisionDatabase(adminUrl, slug("publicprobe")));

    await expect(app`create table public.leak (id int)`).rejects.toThrow(
      /permission denied for schema public/,
    );
  });

  it("keeps the app out of another app's schema", async () => {
    const owner = connect(await provisionDatabase(adminUrl, slug("diary")));
    const other = connect(await provisionDatabase(adminUrl, slug("snoop")));
    await owner`create table secret (body text)`;

    await expect(other`select * from diary.secret`).rejects.toThrow(
      /permission denied for schema diary/,
    );
  });

  it("keeps the example app out of core's schema", async () => {
    const core = connect(await provisionDatabase(adminUrl, slug("core")));
    const example = connect(await provisionDatabase(adminUrl, slug("example")));
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
    const app = connect(await provisionDatabase(adminUrl, slug("schemer")));

    await expect(app`create schema extra`).rejects.toThrow(
      /permission denied for database/,
    );
  });

  it("converges when run again, keeping the app's tables", async () => {
    const first = connect(await provisionDatabase(adminUrl, slug("rerun")));
    await first`create table kept (id int)`;
    await first.end();

    const again = connect(await provisionDatabase(adminUrl, slug("rerun")));

    expect(await again`select count(*)::int as n from kept`).toEqual([
      { n: 0 },
    ]);
  });

  it("refuses a name that can't be a slug", async () => {
    await expect(
      // @ts-expect-error Only readSlug makes a Slug.
      provisionDatabase(adminUrl, "drop table x;--"),
    ).rejects.toThrow(/can't be an app's slug/);
  });
});

const secret = "correct horse battery staple, 32+";

describe("databasePassword", () => {
  it("is the HMAC of the slug under the install's secret", () => {
    expect(databasePassword(secret, slug("notes"))).toBe(
      "5c693a1b5df2ff9abbcbe9142b079cd6e490c362f4f7876cc89f696705028a96",
    );
  });

  it("refuses a secret shorter than 32 characters", () => {
    expect(() => databasePassword("short", slug("notes"))).toThrow(
      "The database secret must be at least 32 characters.",
    );
  });
});

describe("provisionDatabases", () => {
  it("gives each app a role whose password comes from the secret", async () => {
    const urls = await provisionDatabases({
      adminUrl,
      secret,
      slugs: [slug("derived"), slug("derivedtoo")],
    });

    expect([...urls.keys()]).toEqual(["derived", "derivedtoo"]);
    for (const name of [slug("derived"), slug("derivedtoo")]) {
      const url = databaseUrl(adminUrl, name, databasePassword(secret, name));
      expect(urls.get(name)).toBe(url);
      const app = connect(url);
      expect(await app`select current_user as role`).toEqual([{ role: name }]);
    }
  });

  it("leaves every app's URL working when run again", async () => {
    await provisionDatabases({ adminUrl, secret, slugs: [slug("steady")] });
    const first = connect(
      databaseUrl(
        adminUrl,
        slug("steady"),
        databasePassword(secret, slug("steady")),
      ),
    );
    await first`create table kept (id int)`;
    await first.end();

    await provisionDatabases({ adminUrl, secret, slugs: [slug("steady")] });

    const again = connect(
      databaseUrl(
        adminUrl,
        slug("steady"),
        databasePassword(secret, slug("steady")),
      ),
    );
    expect(await again`select count(*)::int as n from kept`).toEqual([
      { n: 0 },
    ]);
  });
});
