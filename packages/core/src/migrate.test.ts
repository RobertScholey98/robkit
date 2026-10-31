import postgres from "postgres";
import { afterAll, describe, expect, inject, it } from "vitest";
import { migrate, migrateFrom } from "./migrate.ts";

const admin = postgres(inject("adminUrl"), { max: 1 });

afterAll(async () => {
  await admin.end();
});

describe("migrate", () => {
  it("keeps every table core owns in the core schema", async () => {
    await migrate(inject("databaseUrl"));

    const tables = await admin<{ schema: string; owner: string }[]>`
      select schemaname as schema, tableowner as owner from pg_tables
      where tableowner = 'core' or schemaname = 'public'`;

    expect(tables.length).toBeGreaterThan(0);
    expect(tables.filter((t) => t.schema !== "core")).toEqual([]);
  });

  it("can run again", async () => {
    await migrate(inject("databaseUrl"));

    await expect(migrate(inject("databaseUrl"))).resolves.toBeUndefined();
  });

  it("applies each migration once, inside core's schema", async () => {
    const folder = new URL("test/fixture-migrations", import.meta.url).pathname;

    await migrateFrom(folder, inject("databaseUrl"));
    await migrateFrom(folder, inject("databaseUrl"));

    expect(await admin`select id from core.probe`).toEqual([{ id: 1 }]);
  });
});
