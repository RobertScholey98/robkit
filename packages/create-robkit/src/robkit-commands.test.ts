import { describe, expect, expectTypeOf, it } from "vitest";
import {
  isRobkitCommand,
  robkitCommands,
  type RobkitCommand,
} from "./robkit-commands.ts";

describe("isRobkitCommand", () => {
  it.each(robkitCommands)("knows %s", (name) => {
    expect(isRobkitCommand(name)).toBe(true);
  });

  it.each(["nothing", "toString", "Add", ""])("refuses %j", (name) => {
    expect(isRobkitCommand(name)).toBe(false);
  });
});

// Type assertions, which tsc checks: the published list names no
// literals, and the dispatch's own type stays exact.
describe("robkitCommands", () => {
  it("is published as a plain list, so a command added changes no type", () => {
    expectTypeOf(robkitCommands).toEqualTypeOf<readonly string[]>();
  });

  it("stays exact inside, so a command without a handler fails to compile", () => {
    expectTypeOf<RobkitCommand>().not.toEqualTypeOf<string>();
  });
});
