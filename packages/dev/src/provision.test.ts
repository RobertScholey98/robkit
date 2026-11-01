import postgres from "postgres";
import { afterAll, describe, expect, inject, it } from "vitest";
import { provisionDatabase } from "./provision.ts";

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
    const app = connect(await provisionDatabase(adminUrl, "notes"));

    await app`create table note (body text)`;
    await app`insert into note values ('hi')`;

    expect(await app`select body from notes.note`).toEqual([{ body: "hi" }]);
  });

  it("keeps the app out of the public schema", async () => {
    const app = connect(await provisionDatabase(adminUrl, "public_probe"));

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

  it.each(["My-App", "drop table x;--", "public", "pg_admin", "postgres", ""])(
    "refuses the slug %j",
    async (slug) => {
      await expect(provisionDatabase(adminUrl, slug)).rejects.toThrow(
        /can't be a database role/,
      );
    },
  );
});
