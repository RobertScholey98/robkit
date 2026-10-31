import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Database } from "./database.ts";

export interface CoreOptions {
  db: Database;
  /** The install's domain, such as `localhost` in development. */
  domain: string;
}

/** The platform apps that call core from the browser with the session cookie. */
const trustedApps = ["hub", "admin"];

function hostnameOf(origin: string): string | undefined {
  try {
    return new URL(origin).hostname;
  } catch {
    return undefined;
  }
}

export function createApp({ db, domain }: CoreOptions): Hono {
  const app = new Hono();
  const trustedHosts = new Set(trustedApps.map((slug) => `${slug}.${domain}`));

  app.use(
    cors({
      origin: (origin) => {
        const hostname = hostnameOf(origin);
        return hostname !== undefined && trustedHosts.has(hostname)
          ? origin
          : null;
      },
      credentials: true,
    }),
  );

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
