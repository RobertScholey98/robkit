import type { CoreOrigin, Slug } from "@robkit/input";
import express, { type Response } from "express";
import { describe, expectTypeOf, it } from "vitest";
import {
  guarded,
  type GuardedLocals,
  type GuardedResponse,
  type Viewer,
} from "./index.ts";

declare const notes: Slug;
declare const core: CoreOrigin;

describe("@robkit/express's types", () => {
  it("is middleware that hands each handler the viewer on res.locals", () => {
    expectTypeOf<GuardedLocals>().toEqualTypeOf<{ viewer: Viewer }>();
    expectTypeOf<GuardedResponse>().toEqualTypeOf<
      Response<unknown, GuardedLocals>
    >();
    express()
      .use(guarded({ app: notes, core }))
      .get("/", (_req, res: GuardedResponse) => {
        expectTypeOf(res.locals.viewer).toEqualTypeOf<Viewer>();
        res.send("ok");
      });
  });

  it("refuses options the guard can't trust", () => {
    // @ts-expect-error A plain string hasn't been read as a slug.
    guarded({ app: "notes", core });
    // @ts-expect-error The guard needs core's origin.
    guarded({ app: notes });
    // @ts-expect-error A plain string hasn't been read as core's origin.
    guarded({ app: notes, core: "http://core.robkit.localhost:3000" });
    const named = { kind: "roles", roleNames: ["Family"] } as const;
    // @ts-expect-error A manifest's rule names roles; the guard's holds ids.
    guarded({ app: notes, core, access: named });
  });
});
