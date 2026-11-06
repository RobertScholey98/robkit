import { describe, expectTypeOf, it } from "vitest";
import type { GuardFault } from "./index.ts";
import { install, type Install, type Slug } from "./addresses.ts";

declare const notes: Slug;
const addresses = install({ domain: "robkit.dev" });

describe("the addresses' types", () => {
  it("works out an app's addresses from its slug alone", () => {
    expectTypeOf<Install["host"]>().parameter(0).toEqualTypeOf<Slug>();
    expectTypeOf<Install["origin"]>().parameter(0).toEqualTypeOf<Slug>();
    addresses.host(notes);
    // The platform's own apps need no reading.
    addresses.origin("core");
    // @ts-expect-error A plain string hasn't been read as a slug.
    addresses.host("notes");
    // @ts-expect-error Nor has a path.
    addresses.origin("bad/path");
    // @ts-expect-error Nor has a string from anywhere else.
    addresses.origin(String(notes));
  });

  it("names the guard's app by its slug when it can't check a request", () => {
    expectTypeOf<GuardFault["app"]>().toEqualTypeOf<Slug>();
  });
});
