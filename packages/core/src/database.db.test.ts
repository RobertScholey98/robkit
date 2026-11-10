import { sql } from "drizzle-orm";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { createDatabase } from "./database.ts";
import { freshDatabase } from "./test/fresh-database.ts";

describe("createDatabase", () => {
  it("keeps Postgres's notices out of core's log", async () => {
    const db = createDatabase(await freshDatabase());
    onTestFinished(() => db.$client.end());
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    onTestFinished(() => {
      log.mockRestore();
    });

    // Postgres answers this with a notice that the table isn't there.
    await db.execute(sql`drop table if exists core.nothing_here`);

    expect(log).not.toHaveBeenCalled();
  });
});
