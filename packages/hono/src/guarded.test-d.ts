import type { CoreOrigin, Slug } from "@robkit/input";
import { Hono, type MiddlewareHandler } from "hono";
import { describe, expectTypeOf, it } from "vitest";
import { guarded, type GuardedEnv, type Viewer } from "./index.ts";
import { guardedAs, guest, owner } from "./testing.ts";

declare const notes: Slug;
declare const core: CoreOrigin;

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

  it("needs no options, and takes the app and core as plain strings", () => {
    expectTypeOf(guarded()).toEqualTypeOf<MiddlewareHandler<GuardedEnv>>();
    guarded({ access: { kind: "owner" } });
    guarded({ app: "notes", core: "http://core.robkit.localhost:3000" });
  });

  it("refuses options the guard can't use", () => {
    // @ts-expect-error A slug is text.
    guarded({ app: 1 });
    const named = { kind: "roles", roleNames: ["Family"] } as const;
    // @ts-expect-error A manifest's rule names roles; the guard's holds ids.
    guarded({ app: notes, core, access: named });
  });

  it("has a stand-in for tests that takes a viewer and stands where guarded() does", () => {
    expectTypeOf(guardedAs(owner())).toEqualTypeOf(guarded());
    guardedAs(guest({ roles: ["family"] }));
    // @ts-expect-error A viewer, not its kind.
    guardedAs("owner");
  });
});
