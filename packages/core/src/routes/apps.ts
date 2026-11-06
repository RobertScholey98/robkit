import { Hono, type Context } from "hono";
import { isProblem, readSlug } from "@robkit/input";
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

function notFound(c: Context<CoreEnv>): Response {
  return c.json({ error: "Not found" }, 404);
}

/** The install's apps: who may open each, and those the launcher lists. */
export function appRoutes(context: RouteContext): Hono<CoreEnv> {
  const { db } = context;
  const routes = new Hono<CoreEnv>();
  const owner = viewer(context, { ownerOnly: true });

  routes.get("/launcher", viewer(context), async (c) =>
    c.json({ apps: await launcherApps(db, c.var.session.forGuard) }),
  );

  // Each app's adapter reads its own rule here, with no cookie, so it's open
  // to anyone. A name that can't be a slug is no app core knows, so it
  // answers 404 before asking the database.
  routes.get("/apps/:slug/access", async (c) => {
    const slug = readSlug(c.req.param("slug"));
    const access = isProblem(slug) ? undefined : await accessOf(db, slug);
    return access ? c.json(access) : notFound(c);
  });

  routes.get("/apps", owner, async (c) => c.json({ apps: await listApps(db) }));

  routes.post("/apps/:slug/access", owner, async (c) => {
    const slug = readSlug(c.req.param("slug"));
    if (isProblem(slug)) return notFound(c);
    const rule = await readBody(c, readAccess);
    if (isProblem(rule)) return c.json(rule, 400);
    const change = await setAccess(db, slug, rule);
    switch (change.outcome) {
      case "unknown-app":
        return notFound(c);
      case "unknown-role":
        return c.json({ error: "One of those roles doesn't exist." }, 400);
      case "changed":
        return c.json(change.access);
    }
  });

  return routes;
}
