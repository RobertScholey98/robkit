import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { migrate, migrateFrom } from "./migrate.ts";
import { freshDatabase } from "./test/fresh-database.ts";

async function query<Row extends object>(
  databaseUrl: string,
  statement: string,
): Promise<Row[]> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    return [...(await sql.unsafe<Row[]>(statement))];
  } finally {
    await sql.end();
  }
}

describe("migrate", () => {
  it("creates core's tables, all in the core schema", async () => {
    const databaseUrl = await freshDatabase();

    await migrate(databaseUrl);

    expect(
      await query(
        databaseUrl,
        `select schemaname as schema, tablename as name from pg_tables
         where tableowner = 'core' or schemaname = 'public'
         order by tablename`,
      ),
    ).toEqual([
      { schema: "core", name: "__drizzle_migrations" },
      { schema: "core", name: "owner" },
      { schema: "core", name: "sessions" },
      { schema: "core", name: "signing_keys" },
    ]);
  });

  it("can run again", async () => {
    const databaseUrl = await freshDatabase();
    await migrate(databaseUrl);

    await expect(migrate(databaseUrl)).resolves.toBeUndefined();
  });

  it("applies each migration once, inside core's schema", async () => {
    const databaseUrl = await freshDatabase();
    const folder = new URL("test/fixture-migrations", import.meta.url).pathname;

    await migrateFrom(folder, databaseUrl);
    await migrateFrom(folder, databaseUrl);

    expect(await query(databaseUrl, "select id from core.probe")).toEqual([
      { id: 1 },
    ]);
  });
});

describe("core's tables", () => {
  it("hold at most one owner", async () => {
    const databaseUrl = await freshDatabase();
    await migrate(databaseUrl);
    const insertOwner = (username: string) =>
      query(
        databaseUrl,
        `insert into core.owner (username, password_hash)
         values ('${username}', 'scrypt$x')`,
      );

    await insertOwner("rob");

    await expect(insertOwner("eve")).rejects.toThrow(/unique/);
    expect(await query(databaseUrl, "select username from core.owner")).toEqual(
      [{ username: "rob" }],
    );
  });
});
