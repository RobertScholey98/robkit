import { describe, expectTypeOf, it } from "vitest";
import {
  orThrow,
  problem,
  readSlug,
  type InputProblem,
  type Slug,
} from "./index.ts";

const asProblem = (value: InputProblem) => value;

describe("orThrow's type", () => {
  it("returns the value's type without the problem", () => {
    expectTypeOf(orThrow(readSlug("notes"))).toEqualTypeOf<Slug>();
  });
});

describe("InputProblem's type", () => {
  it("is made only by problem", () => {
    expectTypeOf(problem).returns.toEqualTypeOf<InputProblem>();
    asProblem(problem("Set PORT."));
    // @ts-expect-error An object with an error field isn't a problem.
    asProblem({ error: "Set PORT." });
  });
});
