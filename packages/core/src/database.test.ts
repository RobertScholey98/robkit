import { describe, expect, it } from "vitest";
import { storedRow } from "./database.ts";

describe("storedRow", () => {
  it("gives back the row an insert returned", () => {
    expect(storedRow({ id: "s1" }, "a session", "core.sessions")).toEqual({
      id: "s1",
    });
  });

  it("names what core was storing, and where, when there's no row", () => {
    expect(() => {
      storedRow(undefined, "a session for owner o1", "core.sessions");
    }).toThrow(
      "Core couldn't store a session for owner o1: the insert into core.sessions returned no row.",
    );
  });
});
