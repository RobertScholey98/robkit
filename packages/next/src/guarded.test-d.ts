import type { CoreOrigin, Slug } from "@robkit/input";
import type { NextProxy } from "next/server.js";
import { describe, expectTypeOf, it } from "vitest";
import { guarded, viewer, type Viewer } from "./index.ts";

declare const notes: Slug;
declare const core: CoreOrigin;

describe("@robkit/next's types", () => {
  it("is a proxy Next runs, whose viewer the app reads with viewer()", () => {
    expectTypeOf(guarded({ app: notes, core })).toExtend<NextProxy>();
    expectTypeOf(viewer).toEqualTypeOf<() => Promise<Viewer>>();
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
