import type { CoreOrigin, Slug } from "@robkit/input";
import type { ServerEntry } from "@tanstack/react-start/server-entry";
import { describe, expectTypeOf, it } from "vitest";
import { guarded, type GuardedContext, type Viewer } from "./index.ts";

declare const notes: Slug;
declare const entry: ServerEntry;
declare const core: CoreOrigin;

describe("@robkit/start's types", () => {
  it("wraps the server entry, and hands the viewer on in its context", () => {
    expectTypeOf(
      guarded(entry, { app: notes, core }),
    ).toEqualTypeOf<ServerEntry>();
    expectTypeOf<GuardedContext>().toEqualTypeOf<{ viewer: Viewer }>();
  });

  it("needs only the entry, and takes the app and core as plain strings", () => {
    expectTypeOf(guarded(entry)).toEqualTypeOf<ServerEntry>();
    guarded(entry, { access: { kind: "owner" } });
    guarded(entry, { app: "notes", core: "http://core.robkit.localhost:3000" });
  });

  it("refuses options the guard can't use", () => {
    // @ts-expect-error A slug is text.
    guarded(entry, { app: 1 });
    // @ts-expect-error It wraps the server entry, so it needs one.
    guarded({ app: notes, core });
    // @ts-expect-error Nor will it take nothing at all.
    guarded();
  });
});
