import { Hono } from "hono";
import { readCodeId } from "@robkit/guard";
import { isProblem } from "@robkit/input";
import {
  listCodes,
  mintCode,
  readNewCode,
  revokeCode,
} from "../access-codes.ts";
import {
  readBody,
  viewer,
  type CoreEnv,
  type RouteContext,
} from "./context.ts";

/** The owner's access codes: listing, minting and revoking them. */
export function accessCodeRoutes(context: RouteContext): Hono<CoreEnv> {
  const { db, install, now } = context;
  const { domain } = install;
  const routes = new Hono<CoreEnv>();
  const owner = viewer(context, { ownerOnly: true });

  routes.get("/codes", owner, async (c) =>
    c.json({ codes: await listCodes(db, now(), domain) }),
  );

  routes.post("/codes", owner, async (c) => {
    const at = now();
    const request = await readBody(c, (fields) => readNewCode(fields, at));
    if (isProblem(request)) return c.json(request, 400);
    const mint = await mintCode(db, request, at, domain);
    if (mint.outcome === "taken") {
      return c.json({ error: "That code is taken." }, 409);
    }
    return c.json(mint.code, 201);
  });

  routes.post("/codes/:id/revoke", owner, async (c) => {
    const id = readCodeId(c.req.param("id"));
    if (isProblem(id) || !(await revokeCode(db, id, now()))) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.body(null, 204);
  });

  return routes;
}
