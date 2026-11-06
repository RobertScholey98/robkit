import { Hono } from "hono";
import { readRoleId } from "@robkit/guard";
import { isProblem } from "@robkit/input";
import {
  createRole,
  listRoles,
  readCodeIds,
  readNewRole,
  setRoleCodes,
} from "../roles.ts";
import {
  readBody,
  viewer,
  type CoreEnv,
  type RouteContext,
} from "./context.ts";

const unknownCode = "One of those codes doesn't exist.";

/** The owner's roles, and the codes that hold each. */
export function roleRoutes(context: RouteContext): Hono<CoreEnv> {
  const { db, now } = context;
  const routes = new Hono<CoreEnv>();
  const owner = viewer(context, { ownerOnly: true });

  routes.get("/roles", owner, async (c) =>
    c.json({ roles: await listRoles(db) }),
  );

  routes.post("/roles", owner, async (c) => {
    const request = await readBody(c, readNewRole);
    if (isProblem(request)) return c.json(request, 400);
    const creation = await createRole(db, request, now());
    switch (creation.outcome) {
      case "unknown-code":
        return c.json({ error: unknownCode }, 400);
      case "taken":
        return c.json({ error: "There's a role with that name." }, 409);
      case "created":
        return c.json(creation.role, 201);
    }
  });

  routes.post("/roles/:id/codes", owner, async (c) => {
    const request = await readBody(c, readCodeIds);
    if (isProblem(request)) return c.json(request, 400);
    const roleId = readRoleId(c.req.param("id"));
    const change = roleId
      ? await setRoleCodes(db, roleId, request.codeIds)
      : { outcome: "unknown-role" as const };
    switch (change.outcome) {
      case "unknown-role":
        return c.json({ error: "Not found" }, 404);
      case "unknown-code":
        return c.json({ error: unknownCode }, 400);
      case "changed":
        return c.json(change.role);
    }
  });

  return routes;
}
