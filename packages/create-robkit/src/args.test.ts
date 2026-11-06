import { CommandProblem } from "@robkit/dev/cli";
import { describe, expect, it } from "vitest";
import { readArgs } from "./args.ts";

const usage = "Usage: thing [--name <name>]";

function read(args: string[]) {
  return readArgs(
    { args, allowPositionals: true, options: { name: { type: "string" } } },
    usage,
  );
}

describe("readArgs", () => {
  it("reads the options and positionals", () => {
    expect(read(["here", "--name", "notes"])).toEqual({
      values: { name: "notes" },
      positionals: ["here"],
    });
  });

  it("refuses an option the command doesn't take, with the usage", () => {
    expect(() => read(["--help"])).toThrow(
      new CommandProblem(`--help isn't an option.\n\n${usage}`),
    );
  });

  it("says an option's value is missing, with the usage", () => {
    expect(() => read(["--name"])).toThrow(CommandProblem);
    expect(() => read(["--name"])).toThrow(
      `Option '--name <value>' argument missing\n\n${usage}`,
    );
  });

  it("keeps parseArgs' own error as the cause", () => {
    expect(() => read(["--help"])).toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({
          code: "ERR_PARSE_ARGS_UNKNOWN_OPTION",
        }) as unknown,
      }),
    );
  });

  it("throws a config parseArgs can't read as a fault, not a problem", () => {
    expect(() =>
      readArgs({ options: { name: { type: "number" as "string" } } }, usage),
    ).toThrow(expect.not.objectContaining({ name: "CommandProblem" }));
  });
});
