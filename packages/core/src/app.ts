import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "./database.ts";

export interface CoreOptions {
  db: Database;
  /** The install's domain, such as `localhost` in development. */
  domain: string;
}

export function createApp({ db }: CoreOptions): Hono {
  const app = new Hono();

  app.get("/status", async (c) => {
    try {
      await db.execute(sql`select 1`);
    } catch {
      return c.json({ status: "unavailable" }, 503);
    }
    return c.json({ status: "ok" });
  });

  return app;
}
