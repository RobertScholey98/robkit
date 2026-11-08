import { describe, expect, it } from "vitest";
import {
  allProblems,
  isProblem,
  orThrow,
  parseJson,
  problem,
  readPort,
} from "./index.ts";

describe("problem", () => {
  it("makes a problem with its message", () => {
    const made = problem("Set PORT.");

    expect(isProblem(made)).toBe(true);
    expect(made.error).toBe("Set PORT.");
  });

  it("is the only maker: an object with an error field isn't a problem", () => {
    expect(isProblem({ error: "Set PORT." })).toBe(false);
  });

  it("doesn't mistake parsed JSON with an error field for a problem", () => {
    const parsed = parseJson('{"error": "not found"}', "the body");

    expect(isProblem(parsed)).toBe(false);
    expect(isProblem(isProblem(parsed) ? parsed : parsed.json)).toBe(false);
  });

  it("refuses what isn't an object", () => {
    expect([null, undefined, "Set PORT.", 1].map(isProblem)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("allProblems", () => {
  it("joins every problem among the reads, a line each, as one problem", () => {
    const joined = allProblems(
      problem("Set PORT."),
      3000,
      problem("Set HOST."),
    );

    expect(isProblem(joined)).toBe(true);
    expect(joined.error).toBe("Set PORT.\nSet HOST.");
  });
});

describe("orThrow", () => {
  it("returns a value that read", () => {
    expect(orThrow(readPort({ PORT: "3001" }))).toBe(3001);
  });

  it("throws a problem as an error with its message", () => {
    expect(() => orThrow(readPort({ PORT: "x" }))).toThrow(
      new Error(
        'PORT is "x", which isn\'t a port. Set it to a whole number from 1 to 65535.',
      ),
    );
  });
});
