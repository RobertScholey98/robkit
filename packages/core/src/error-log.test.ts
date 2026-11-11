import { aCoreOrigin } from "@internal/test-session";
import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import type { Database } from "./database.ts";
import { printedLog } from "./test/printed-log.ts";

const typedCode = "SECRETCODE42";

describe("core's log of a database fault", () => {
  it("holds no values when a route reports through its logError", async () => {
    const log = printedLog();
    // A database whose every query fails as Drizzle reports it, with the
    // query's values, so /status's logError has one to leave out.
    const db = {
      execute: () =>
        Promise.reject(new DrizzleQueryError("select $1", [typedCode])),
    } as unknown as Database;
    const app = createApp({ db, origin: aCoreOrigin() });

    const res = await app.request("/status");

    expect(res.status).toBe(503);
    const printed = log();
    expect(printed).toContain(
      "GET /status: the database is unreachable. Check DATABASE_URL and that Postgres is running.",
    );
    expect(printed).toContain("Failed query: select $1");
    expect(printed).not.toContain(typedCode);
  });
});
