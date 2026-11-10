import { printedOnExit } from "@internal/test-session";
import { pgTable, serial } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appDatabase } from "./app-database.ts";

const schema = { note: pgTable("note", { id: serial().primaryKey() }) };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("appDatabase", () => {
  it("reads nothing until its first call, so a build can load the app with no database", () => {
    vi.stubEnv("DATABASE_URL", undefined);

    expect(() => appDatabase(schema)).not.toThrow();
  });

  it("ends the app with the reader's message on its first call when DATABASE_URL isn't set", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    const database = appDatabase(schema);

    expect(printedOnExit(() => database())).toBe(
      "DATABASE_URL is not set. Run the app with pnpm dev, which sets it, or set it to a postgres:// URL.",
    );
  });

  it("ends the app with the reader's message when DATABASE_URL isn't a postgres:// URL", () => {
    vi.stubEnv("DATABASE_URL", "mysql://notes@localhost/notes");
    const database = appDatabase(schema);

    expect(printedOnExit(() => database())).toBe(
      "DATABASE_URL isn't a postgres:// URL. Set it to one, such as postgres://user:password@host:5432/database.",
    );
  });
});
