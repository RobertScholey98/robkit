import type { Slug } from "@robkit/session/addresses";
import type { ServerEntry } from "@tanstack/react-start/server-entry";
import { describe, expectTypeOf, it } from "vitest";
import { guarded, type GuardedContext, type Viewer } from "./index.ts";

declare const notes: Slug;
declare const entry: ServerEntry;
const core = "http://core.robkit.localhost:3000";

describe("@robkit/start's types", () => {
  it("wraps the server entry, and hands the viewer on in its context", () => {
    expectTypeOf(
      guarded(entry, { app: notes, core }),
    ).toEqualTypeOf<ServerEntry>();
    expectTypeOf<GuardedContext>().toEqualTypeOf<{ viewer: Viewer }>();
  });

  it("refuses options the guard can't trust", () => {
    // @ts-expect-error A plain string hasn't been read as a slug.
    guarded(entry, { app: "notes", core });
    // @ts-expect-error The guard needs core's origin.
    guarded(entry, { app: notes });
    // @ts-expect-error It wraps the server entry, so it needs one.
    guarded({ app: notes, core });
  });
});
