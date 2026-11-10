import { describe, expect, it, vi } from "vitest";
import { serve } from "./serve.ts";

// A next whose default isn't the function that makes its server, as a
// bundler's copy of Next might give.
vi.mock("next", () => ({ default: { default: () => undefined } }));

describe("@robkit/next/serve with a next it can't use", () => {
  it("throws, naming what it couldn't find", () => {
    expect(() => serve()).toThrow(
      "next exports object, not the function that makes its server.",
    );
  });
});
