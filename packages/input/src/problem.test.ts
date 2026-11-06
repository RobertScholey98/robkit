import { describe, expect, it } from "vitest";
import { orThrow, readPort } from "./index.ts";

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
