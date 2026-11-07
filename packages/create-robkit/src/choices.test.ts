import { describe, expect, it } from "vitest";
import { readChoices, readyStacks, stackFrom } from "./choices.ts";

describe("stackFrom", () => {
  it.each(["start", "react-hono", "express"])(
    "reads %s, a stack robkit can make",
    (value) => {
      expect(stackFrom(value)).toBe(value);
    },
  );

  it.each(["next", "", "start,react-hono"])("refuses %j", (value) => {
    expect(() => stackFrom(value)).toThrow(
      `--stack ${value} isn't an option. Choose from: start, react-hono, express.`,
    );
  });
});

describe("readyStacks", () => {
  it("leaves out the stacks coming later", () => {
    expect(readyStacks).toEqual(["start", "react-hono", "express"]);
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
        "robkit.json: exampleStack is missing. Set it to the example app's stack: start, react-hono or express.",
    });
  });

  it.each([["next"], [1]])("refuses the stack %j", (exampleStack) => {
    expect(readChoices({ exampleStack })).toEqual({
      error: `robkit.json: exampleStack is ${JSON.stringify(exampleStack)}, which robkit can't make. Set it to start, react-hono or express.`,
    });
  });
});
