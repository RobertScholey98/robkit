import { describe, expect, it } from "vitest";
import { isRobkitCommand, robkitCommands } from "./robkit-commands.ts";

describe("isRobkitCommand", () => {
  it.each(robkitCommands)("knows %s", (name) => {
    expect(isRobkitCommand(name)).toBe(true);
  });

  it.each(["nothing", "toString", "Add", ""])("refuses %j", (name) => {
    expect(isRobkitCommand(name)).toBe(false);
  });
});
