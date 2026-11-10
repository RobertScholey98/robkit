import { eq, sql } from "drizzle-orm";
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appDatabase } from "./app-database.ts";
import { adminUrlFor, freshDatabase, query } from "./test/fresh-database.ts";

const note = pgTable("note", {
  id: serial().primaryKey(),
  body: text().notNull(),
});
const tag = pgTable("tag", {
  id: serial().primaryKey(),
  name: text().notNull(),
});

/** A database with the two tables, and DATABASE_URL set to it. */
async function appWithTables(): Promise<string> {
  const databaseUrl = await freshDatabase();
  await query(
    databaseUrl,
    "create table note (id serial primary key, body text not null); create table tag (id serial primary key, name text not null)",
  );
  vi.stubEnv("DATABASE_URL", databaseUrl);
  return databaseUrl;
}

/** How many connections the app's role holds open to `databaseUrl`'s database. */
async function openConnections(databaseUrl: string): Promise<number> {
  const [row] = await query<{ n: number }>(
    adminUrlFor(databaseUrl),
    `select count(*)::int as n from pg_stat_activity
     where datname = current_database() and usename = 'notes'`,
  );
  return row?.n ?? 0;
}

/**
 * Loads the package again, as a dev server does when it reloads the app's
 * modules, and calls `appDatabase` from the fresh copy.
 */
async function reloaded<TSchema extends Record<string, unknown>>(
  schema: TSchema,
) {
  vi.resetModules();
  const fresh = await import("./app-database.ts");
  return fresh.appDatabase(schema);
}

const opened: postgres.Sql[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(opened.splice(0).map((client) => client.end()));
});

describe("appDatabase", () => {
  it("connects on first call as the app's own role, and its queries land in the app's schema", async () => {
    const databaseUrl = await appWithTables();
    const database = appDatabase({ note });

    const db = database();
    opened.push(db.$client);
    await db.insert(note).values({ body: "hello" });

    expect(await db.execute(sql`select current_user as role`)).toEqual([
      { role: "notes" },
    ]);
    expect(
      await query(adminUrlFor(databaseUrl), "select body from notes.note"),
    ).toEqual([{ body: "hello" }]);
  });

  it("gives the same database on every call", async () => {
    await appWithTables();
    const database = appDatabase({ note });

    const db = database();
    opened.push(db.$client);

    expect(database()).toBe(db);
  });

  it("keeps one pool however many times the app's modules reload", async () => {
    const databaseUrl = await appWithTables();

    for (let reload = 0; reload < 5; reload++) {
      const db = (await reloaded({ note }))();
      opened.push(db.$client);
      await db.select().from(note);
    }

    expect(await openConnections(databaseUrl)).toBe(1);
  });

  it("knows a table added to the schema between reloads", async () => {
    await appWithTables();
    const before = (await reloaded({ note }))();
    opened.push(before.$client);
    expect(before.query).not.toHaveProperty("tag");

    const after = (await reloaded({ note, tag }))();
    await after.insert(tag).values({ name: "family" });

    expect(
      await after.query.tag.findMany({ where: eq(tag.name, "family") }),
    ).toEqual([{ id: 1, name: "family" }]);
  });

  it("opens at most two connections unless told otherwise", async () => {
    const databaseUrl = await appWithTables();
    const db = appDatabase({ note })();
    opened.push(db.$client);

    await Promise.all(
      [1, 2, 3].map(() => db.execute(sql`select pg_sleep(0.1)`)),
    );

    expect(await openConnections(databaseUrl)).toBe(2);
  });

  it("passes postgres.js options on, over its own", async () => {
    await appWithTables();
    const database = appDatabase(
      { note },
      { connection: { application_name: "notes-app" } },
    );

    const db = database();
    opened.push(db.$client);

    expect(
      await db.execute(sql`select current_setting('application_name') as name`),
    ).toEqual([{ name: "notes-app" }]);
  });
});
