import type { CoreOrigin } from "@robkit/input";
import { describe, expectTypeOf, it } from "vitest";
import { createApp, type CoreOptions } from "./app.ts";
import type { Database } from "./database.ts";

// Checked by tsc, in core's typecheck.
declare const db: Database;
declare const robkitDev: CoreOrigin;

describe("createApp's types", () => {
  it("takes core's origin only as readCoreUrl made it", () => {
    expectTypeOf<CoreOptions["origin"]>().toEqualTypeOf<CoreOrigin>();
    createApp({ db, origin: robkitDev });
    // @ts-expect-error A plain string hasn't been read as core's origin.
    createApp({ db, origin: "https://core.robkit.dev" });
    // @ts-expect-error Nor has a domain, which isn't an origin.
    createApp({ db, origin: "robkit.dev" });
  });
});
