import { Hono } from "hono";
import { isProblem } from "@robkit/session/input";
import {
  accessOf,
  launcherApps,
  listApps,
  readAccess,
  setAccess,
} from "../apps.ts";
import {
  readBody,
  viewer,
  type CoreEnv,
  type RouteContext,
} from "./context.ts";

/** The install's apps: who may open each, and those the launcher lists. */
export function appRoutes(context: RouteContext): Hono<CoreEnv> {
  const { db } = context;
  const routes = new Hono<CoreEnv>();
  const owner = viewer(context, { ownerOnly: true });

  routes.get("/launcher", viewer(context), async (c) =>
    c.json({ apps: await launcherApps(db, c.var.session.forGuard) }),
  );

  // Each app's adapter reads its own rule here, with no cookie, so it's open
  // to anyone.
  routes.get("/apps/:slug/access", async (c) => {
    const access = await accessOf(db, c.req.param("slug"));
    return access ? c.json(access) : c.json({ error: "Not found" }, 404);
  });

  routes.get("/apps", owner, async (c) => c.json({ apps: await listApps(db) }));

  routes.post("/apps/:slug/access", owner, async (c) => {
    const rule = await readBody(c, readAccess);
    if (isProblem(rule)) return c.json(rule, 400);
    const change = await setAccess(db, c.req.param("slug"), rule);
    switch (change.outcome) {
      case "unknown-app":
        return c.json({ error: "Not found" }, 404);
      case "unknown-role":
        return c.json({ error: "One of those roles doesn't exist." }, 400);
      case "changed":
        return c.json(change.access);
    }
  });

  return routes;
}
