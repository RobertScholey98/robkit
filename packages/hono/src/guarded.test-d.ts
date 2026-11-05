import type { Slug } from "@robkit/session/addresses";
import { Hono, type MiddlewareHandler } from "hono";
import { describe, expectTypeOf, it } from "vitest";
import { guarded, type GuardedEnv, type Viewer } from "./index.ts";

declare const notes: Slug;
const core = "http://core.robkit.localhost:3000";

describe("@robkit/hono's types", () => {
  it("is middleware that hands each handler the viewer", () => {
    expectTypeOf(guarded({ app: notes, core })).toEqualTypeOf<
      MiddlewareHandler<GuardedEnv>
    >();
    new Hono<GuardedEnv>().use(guarded({ app: notes, core })).get("/", (c) => {
      expectTypeOf(c.var.viewer).toEqualTypeOf<Viewer>();
      return c.text("ok");
    });
  });

  it("refuses options the guard can't trust", () => {
    // @ts-expect-error A plain string hasn't been read as a slug.
    guarded({ app: "notes", core });
    // @ts-expect-error The guard needs core's origin.
    guarded({ app: notes });
    const named = { kind: "roles", roleNames: ["Family"] } as const;
    // @ts-expect-error A manifest's rule names roles; the guard's holds ids.
    guarded({ app: notes, core, access: named });
  });
});
