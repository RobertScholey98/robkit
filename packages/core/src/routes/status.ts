import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { CoreEnv, RouteContext } from "./context.ts";

/** Whether core can answer, for a health check. */
export function statusRoutes({ db, logError }: RouteContext): Hono<CoreEnv> {
  const routes = new Hono<CoreEnv>();

  routes.get("/status", async (c) => {
    try {
      await db.execute(sql`select 1`);
    } catch (error) {
      logError(
        `${c.req.method} ${c.req.path}: the database is unreachable. Check DATABASE_URL and that Postgres is running.`,
        error,
      );
      return c.json({ status: "unavailable" }, 503);
    }
    return c.json({ status: "ok" });
  });

  return routes;
}
