import type { Domain } from "@robkit/input";
import { describe, expectTypeOf, it } from "vitest";
import { createApp, type CoreOptions } from "./app.ts";
import type { Database } from "./database.ts";

// Checked by tsc, in core's typecheck.
declare const db: Database;
declare const robkitDev: Domain;

describe("createApp's types", () => {
  it("takes the install's domain only as readDomain made it", () => {
    expectTypeOf<CoreOptions["domain"]>().toEqualTypeOf<Domain>();
    createApp({ db, domain: robkitDev });
    // @ts-expect-error A plain string hasn't been read as a domain.
    createApp({ db, domain: "robkit.dev" });
    // @ts-expect-error Nor has a URL, which readDomain refuses.
    createApp({ db, domain: "https://x.com/" });
  });
});
