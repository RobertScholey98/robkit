import { describe, expectTypeOf, it } from "vitest";
import { install, type Install, type InstallOptions } from "./addresses.ts";
import type { Domain } from "./env.ts";
import type { Slug } from "./slug.ts";

declare const notes: Slug;
declare const robkitDev: Domain;
const addresses = install({ domain: robkitDev });

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

  it("takes the domain only as readDomain made it", () => {
    expectTypeOf<InstallOptions["domain"]>().toEqualTypeOf<Domain>();
    expectTypeOf<Install["domain"]>().toEqualTypeOf<Domain>();
    // @ts-expect-error A plain string hasn't been read as a domain.
    install({ domain: "robkit.dev" });
    // @ts-expect-error Nor has a URL.
    install({ domain: "https://robkit.dev/" });
  });
});
