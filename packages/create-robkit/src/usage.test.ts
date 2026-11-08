import { describe, expect, it } from "vitest";
import { usage } from "./usage.ts";

describe("usage", () => {
  it("reads as init's help, naming only the stacks robkit can make", () => {
    expect(usage).toBe(`Usage: npm create robkit [folder] -- [options]

With no --stack, init asks for the folder and the example app's stack.

  --stack <name>          the example app's stack: start, react-hono, express,
                          next, go
  --install               install dependencies and initialise git
  --link                  link the @robkit packages to the robkit checkout
                          this runs from, instead of installing them from npm`);
  });
});
