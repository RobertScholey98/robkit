import { describe, expectTypeOf, it } from "vitest";
import { orThrow, readSlug, type Slug } from "./index.ts";

describe("orThrow's type", () => {
  it("returns the value's type without the problem", () => {
    expectTypeOf(orThrow(readSlug("notes"))).toEqualTypeOf<Slug>();
  });
});
