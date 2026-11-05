import { describe, expect, it } from "vitest";
import { readyStacks, stackFrom } from "./choices.ts";

describe("stackFrom", () => {
  it("reads a stack robkit can make", () => {
    expect(stackFrom("react-hono")).toBe("react-hono");
  });

  it.each(["next", "", "start,react-hono"])("refuses %j", (value) => {
    expect(() => stackFrom(value)).toThrow(
      `--stack ${value} isn't an option. Choose from: start, react-hono.`,
    );
  });
});

describe("readyStacks", () => {
  it("leaves out the stacks coming later", () => {
    expect(readyStacks).toEqual(["start", "react-hono"]);
  });
});
