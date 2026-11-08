import { describe, expect, it } from "vitest";
import { readChoices, readyStacks, stackFrom, toolchainOf } from "./choices.ts";

describe("stackFrom", () => {
  it.each(["start", "react-hono", "express", "next", "go"])(
    "reads %s, a stack robkit can make",
    (value) => {
      expect(stackFrom(value)).toBe(value);
    },
  );

  it.each(["rails", "", "start,react-hono"])("refuses %j", (value) => {
    expect(() => stackFrom(value)).toThrow(
      `--stack ${value} isn't an option. Choose from: start, react-hono, express, next, go.`,
    );
  });
});

describe("readyStacks", () => {
  it("lists every stack robkit can make", () => {
    expect(readyStacks).toEqual([
      "start",
      "react-hono",
      "express",
      "next",
      "go",
    ]);
  });
});

describe("toolchainOf", () => {
  it("names Go for the stack whose server is Go, and nothing for the rest", () => {
    expect(readyStacks.map((stack) => [stack, toolchainOf(stack)])).toEqual([
      ["start", undefined],
      ["react-hono", undefined],
      ["express", undefined],
      ["next", undefined],
      ["go", "go"],
    ]);
  });
});

describe("readChoices", () => {
  it("reads the choices robkit.json records", () => {
    expect(readChoices({ exampleStack: "react-hono" })).toEqual({
      exampleStack: "react-hono",
    });
  });

  it.each([null, [], "start"])("refuses %j", (value) => {
    expect(readChoices(value)).toEqual({
      error:
        'robkit.json must be a JSON object, such as {"exampleStack": "start"}. Init wrote it; restore it from git if it has changed.',
    });
  });

  it("says which key is missing", () => {
    expect(readChoices({})).toEqual({
      error:
        "robkit.json: exampleStack is missing. Set it to the example app's stack: start, react-hono, express, next or go.",
    });
  });

  it.each([["rails"], [1]])("refuses the stack %j", (exampleStack) => {
    expect(readChoices({ exampleStack })).toEqual({
      error: `robkit.json: exampleStack is ${JSON.stringify(exampleStack)}, which robkit can't make. Set it to start, react-hono, express, next or go.`,
    });
  });
});
