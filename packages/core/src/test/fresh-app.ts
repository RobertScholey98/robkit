import type { Hono } from "hono";
import { onTestFinished } from "vitest";
import { createApp } from "../app.ts";
import { createDatabase, type Database } from "../database.ts";
import { migrate } from "../migrate.ts";
import { freshDatabase } from "./fresh-database.ts";

export interface FreshCore {
  app: Hono;
  db: Database;
  /** Moves core's clock forward. */
  advance: (ms: number) => void;
}

/**
 * Core on its own migrated database, with a clock the test moves. Closes its
 * connections when the test finishes.
 */
export async function freshCore({
  domain = "robkit.test",
}: { domain?: string } = {}): Promise<FreshCore> {
  const databaseUrl = await freshDatabase();
  await migrate(databaseUrl);
  const db = createDatabase(databaseUrl);
  onTestFinished(() => db.$client.end());

  let now = Date.parse("2026-11-01T12:00:00Z");
  const app = createApp({ db, domain, now: () => new Date(now) });
  return {
    app,
    db,
    advance: (ms) => {
      now += ms;
    },
  };
}
