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
      { schema: "core", name: "access_codes" },
      { schema: "core", name: "code_roles" },
      { schema: "core", name: "owner" },
      { schema: "core", name: "roles" },
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

  it("give each session exactly one holder, the owner or a code", async () => {
    const databaseUrl = await freshDatabase();
    await migrate(databaseUrl);
    const [rob] = await query<{ id: string }>(
      databaseUrl,
      `insert into core.owner (username, password_hash)
       values ('rob', 'scrypt$x') returning id`,
    );
    const [test] = await query<{ id: string }>(
      databaseUrl,
      `select id from core.access_codes where code = 'TEST'`,
    );
    const insertSession = (ownerId: string, codeId: string) =>
      query(
        databaseUrl,
        `insert into core.sessions (owner_id, code_id, expires_at)
         values (${ownerId}, ${codeId}, now())`,
      );

    await insertSession(`'${rob?.id ?? ""}'`, "null");
    await insertSession("null", `'${test?.id ?? ""}'`);

    await expect(
      insertSession(`'${rob?.id ?? ""}'`, `'${test?.id ?? ""}'`),
    ).rejects.toThrow(/sessions_one_holder/);
    await expect(insertSession("null", "null")).rejects.toThrow(
      /sessions_one_holder/,
    );
  });

  it("hold access codes only as 3 to 32 upper-case letters or digits", async () => {
    const databaseUrl = await freshDatabase();
    await migrate(databaseUrl);
    const insertCode = (code: string) =>
      query(
        databaseUrl,
        `insert into core.access_codes (code, name) values ('${code}', 'Gran')`,
      );

    await insertCode("K7XQ2");

    for (const code of ["k7xq3", "AB", "A".repeat(33), "AB-CD", " ABCD"]) {
      await expect(insertCode(code)).rejects.toThrow(/access_codes_code_shape/);
    }
    expect(
      await query(
        databaseUrl,
        "select code from core.access_codes order by code",
      ),
    ).toEqual([{ code: "K7XQ2" }, { code: "TEST" }]);
  });
});
