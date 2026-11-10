import * as builders from "@robkit/guard/testing";
import { describe, expect, it } from "vitest";
import * as testing from "./testing.ts";

describe("@robkit/next/testing", () => {
  it("gives @robkit/guard's builders, and no stand-in for the guard", () => {
    expect({ ...testing }).toEqual({
      owner: builders.owner,
      guest: builders.guest,
      nobody: builders.nobody,
    });
  });
});
